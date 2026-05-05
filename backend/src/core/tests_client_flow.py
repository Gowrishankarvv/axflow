from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from tables import Client, Project, DataRequest, Task

User = get_user_model()

class ClientFlowTests(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        
        # Create different user roles
        self.superuser = User.objects.create_superuser(username='admin', email='admin@test.com', password='password')
        self.manager = User.objects.create_user(username='manager', email='manager@test.com', password='password', role='manager')
        self.employee = User.objects.create_user(username='employee', email='emp@test.com', password='password', role='employee')
        
        # Create Clients
        self.client_org_a = Client.objects.create(name='Client A', domain='clienta.com')
        self.client_org_b = Client.objects.create(name='Client B', domain='clientb.com')
        
        # Create Client Users
        self.client_user_a = User.objects.create_user(
            username='client_a', email='user@clienta.com', password='password', 
            role='client', client_org=self.client_org_a
        )
        self.client_user_b = User.objects.create_user(
            username='client_b', email='user@clientb.com', password='password', 
            role='client', client_org=self.client_org_b
        )
        
        # Create Projects
        self.project_a = Project.objects.create(name='Project A', client=self.client_org_a, created_by=self.manager)
        self.project_b = Project.objects.create(name='Project B', client=self.client_org_b, created_by=self.manager)

    def test_client_crud_permissions(self):
        """Test that only privileged users can manage Client objects"""
        # Anonymous - Fail
        self.client_api.logout()
        res = self.client_api.post('/api/clients/', {'name': 'New Client'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Client User - Fail
        self.client_api.force_authenticate(user=self.client_user_a)
        res = self.client_api.post('/api/clients/', {'name': 'New Client'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        
        # Manager - Success
        self.client_api.force_authenticate(user=self.manager)
        res = self.client_api.post('/api/clients/', {'name': 'New Client Manager', 'domain': 'test.com'})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Client.objects.filter(name='New Client Manager').exists())
        
    def test_data_request_flow(self):
        """Test the full lifecycle of a data request"""
        # 1. Client A creates a request for Project A
        self.client_api.force_authenticate(user=self.client_user_a)
        
        # Prepare file upload (mock)
        from django.core.files.uploadedfile import SimpleUploadedFile
        file = SimpleUploadedFile("test.csv", b"file_content", content_type="text/csv")
        
        payload = {
            'project': self.project_a.id,
            'title': 'Need Data',
            'description': 'Urgent',
            'file': file
        }
        res = self.client_api.post('/api/requests/', payload, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        request_id = res.data['id']
        
        req = DataRequest.objects.get(id=request_id)
        self.assertEqual(req.status, 'pending_review')
        self.assertEqual(req.requester, self.client_user_a)
        
        # 2. Verify Client B cannot see this request
        self.client_api.force_authenticate(user=self.client_user_b)
        res = self.client_api.get(f'/api/requests/{request_id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        
        res = self.client_api.get('/api/requests/')
        self.assertEqual(len(res.data), 0) # Should see none
        
        # 3. Manager estimates the request
        self.client_api.force_authenticate(user=self.manager)
        
        # Manager should see it
        res = self.client_api.get(f'/api/requests/{request_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Provide Estimate
        estimate_payload = {
            'estimated_cost': 500.00,
            'estimation_notes': 'Takes 5 hours'
        }
        res = self.client_api.post(f'/api/requests/{request_id}/estimate/', estimate_payload)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        req.refresh_from_db()
        self.assertEqual(req.status, 'pending_approval')
        self.assertEqual(req.estimated_cost, 500.00)
        
        # 4. Client A approves the request
        self.client_api.force_authenticate(user=self.client_user_a)
        res = self.client_api.post(f'/api/requests/{request_id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        req.refresh_from_db()
        self.assertEqual(req.status, 'approved')
        self.assertIsNotNone(req.task)
        self.assertEqual(req.task.project, self.project_a)
        self.assertEqual(req.task.title, f"[Request] {req.title}")
        
    def test_invoice_access(self):
        """Test invoice visibility"""
        from tables import Invoice
        from datetime import date
        
        # Create Invoice for Client A
        inv = Invoice.objects.create(
            client=self.client_org_a,
            project=self.project_a,
            billing_period=date(2023, 1, 1),
            file='invoices/test.pdf'
        )
        
        # Client A should see it
        self.client_api.force_authenticate(user=self.client_user_a)
        res = self.client_api.get('/api/invoices/')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id'], inv.id)
        
        # Client B should NOT see it
        self.client_api.force_authenticate(user=self.client_user_b)
        res = self.client_api.get('/api/invoices/')
        self.assertEqual(len(res.data), 0)
