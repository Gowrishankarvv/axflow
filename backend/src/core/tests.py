from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from .models import Project, ProjectAssignment, TimeEntry, Task, TaskAssignment
from django.utils import timezone

User = get_user_model()

class CoreFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.super = User.objects.create_user(username='admin', email='admin@Axinortech.com', password='AdminPassword123!', role='superuser')
        self.manager = User.objects.create_user(username='manager', email='manager@Axinortech.com', password='ManagerPassword123!', role='manager')
        self.employee = User.objects.create_user(username='employee', email='employee@Axinortech.com', password='EmployeePassword123!', role='employee', manager=self.manager)

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_user_creation_and_domain_validation(self):
        self.auth(self.super)
        resp = self.client.post('/api/users/', {
            'username': 'newuser',
            'email': 'newuser@Axinortech.com',
            'role': 'employee',
            'manager': self.manager.id
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_project_assignment_and_timeentry_visibility(self):
        self.auth(self.super)
        project = Project.objects.create(name='Project 1', created_by=self.super)
        self.auth(self.manager)
        resp = self.client.post('/api/assignments/', {
            'project': project.id,
            'assignee': self.employee.id,
            'allotted_hours': '10.00'
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.auth(self.employee)
        start = timezone.now()
        end = start + timezone.timedelta(hours=2)
        resp = self.client.post('/api/time-entries/', {
            'user': self.employee.id,
            'project': project.id,
            'start_datetime': start.isoformat(),
            'end_datetime': end.isoformat(),
            'description': 'Worked on feature'
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.auth(self.manager)
        resp = self.client.get('/api/time-entries/?team=true')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data['results']) if isinstance(resp.data, dict) and 'results' in resp.data else len(resp.data), 1)

    def test_first_time_password_flow_flag(self):
        u = User.objects.create_user(username='alice', email='alice@Axinortech.com', password='TempPass123!', role='employee', must_set_password=True)
        client = APIClient()
        resp = client.post('/api/auth/login/', {'email': 'alice@Axinortech.com', 'password': 'TempPass123!'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_task_multi_assignee_creation_and_visibility(self):
        self.auth(self.super)
        project = Project.objects.create(name='Project 1', created_by=self.super)
        # Assign users to project
        ProjectAssignment.objects.create(project=project, assignee=self.manager, assigned_by=self.super)
        ProjectAssignment.objects.create(project=project, assignee=self.employee, assigned_by=self.super)
        # Create task with multiple assignees
        resp = self.client.post('/api/tasks/', {
            'project': project.id,
            'title': 'Test Task',
            'description': 'Test description',
            'assignees': [self.manager.id, self.employee.id]
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        task_id = resp.data['id']
        # Check task assignments created
        assignments = TaskAssignment.objects.filter(task_id=task_id)
        self.assertEqual(assignments.count(), 2)
        # Check visibility for manager
        self.auth(self.manager)
        resp = self.client.get('/api/tasks/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data['results']) if 'results' in resp.data else len(resp.data), 1)
        # Check time entry requires assignee
        start = timezone.now()
        end = start + timezone.timedelta(hours=1)
        resp = self.client.post('/api/time-entries/', {
            'project': project.id,
            'task': task_id,
            'start_datetime': start.isoformat(),
            'end_datetime': end.isoformat(),
            'description': 'Test time'
        }, format='json')
        self.assertEqual(resp.status_code, 201)  # Should work since manager is assignee
        # For non-assignee, create another user
        other_employee = User.objects.create_user(username='other', email='other@Axinortech.com', password='OtherPass123!', role='employee')
        self.auth(other_employee)
        resp = self.client.post('/api/time-entries/', {
            'project': project.id,
            'task': task_id,
            'start_datetime': start.isoformat(),
            'end_datetime': end.isoformat(),
            'description': 'Test time'
        }, format='json')
        self.assertEqual(resp.status_code, 400)  # Should fail since not assigned to task
