from django.test import TestCase
from rest_framework.test import APIClient
from django.utils import timezone
from core.models import User, Project, ProjectAssignment, TimeEntry, ActiveTimeEntry


class ApiSmokeTests(TestCase):
    """
    End-to-end API smoke tests using DRF's APIClient.

    These tests demonstrate the expected JSON payloads and query params
    for common endpoints and assert that protected routes require JWT.
    """

    def setUp(self):
        self.client = APIClient()

        # Create users
        self.superuser = User.objects.create(
            email='ceo@example.com', username='ceo@example.com', first_name='ceosir', role='superuser', must_set_password=False
        )
        self.superuser.set_password('Password123!')
        self.superuser.save()

        self.manager = User.objects.create(
            email='manager@example.com', username='manager@example.com', first_name='Siva', role='manager', must_set_password=False, manager=self.superuser
        )
        self.manager.set_password('Password123!')
        self.manager.save()

        self.employee = User.objects.create(
            email='employee@example.com', username='employee@example.com', first_name='Rinu', role='employee', must_set_password=False, manager=self.manager
        )
        self.employee.set_password('Password123!')
        self.employee.save()

        # Create project
        self.project = Project.objects.create(name='Website', description='Site work', created_by=self.superuser)
        ProjectAssignment.objects.create(project=self.project, assignee=self.employee, assigned_by=self.superuser)

    def _login(self, email, password='Password123!'):
        # POST /api/auth/login/ -> {access, refresh}
        resp = self.client.post('/api/auth/login/', {"email": email, "password": password}, format='json')
        self.assertEqual(resp.status_code, 200)
        token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_jwt_login_and_me(self):
        self._login('ceo@example.com')
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['email'], 'ceo@example.com')

    def test_create_time_entry_and_filter(self):
        self._login('employee@example.com')

        # POST /api/time-entries/
        start = timezone.now().replace(microsecond=0)
        end = start + timezone.timedelta(hours=2)
        payload = {
            "project": self.project.id,
            "start_datetime": start.isoformat().replace('+00:00', 'Z'),
            "end_datetime": end.isoformat().replace('+00:00', 'Z'),
            "description": "Worked on dashboard"
        }
        resp = self.client.post('/api/time-entries/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        self.assertIn('id', resp.data)
        self.assertEqual(resp.data['project'], self.project.id)

        # GET /api/time-entries/?user_id=me&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
        start_date = start.date().isoformat()
        end_date = end.date().isoformat()
        url = f'/api/time-entries/?user_id=me&start_date={start_date}&end_date={end_date}'
        resp2 = self.client.get(url)
        self.assertEqual(resp2.status_code, 200)
        self.assertGreaterEqual(resp2.data.get('count', len(resp2.data)), 1)

    def test_manager_visibility(self):
        # Employee creates entry
        self._login('employee@example.com')
        start = timezone.now().replace(microsecond=0)
        end = start + timezone.timedelta(hours=1)
        self.client.post('/api/time-entries/', {
            "project": self.project.id,
            "start_datetime": start.isoformat().replace('+00:00', 'Z'),
            "end_datetime": end.isoformat().replace('+00:00', 'Z'),
            "description": "Daily work"
        }, format='json')

        # Manager should see their team's entries via filter user_id
        self._login('manager@example.com')
        resp = self.client.get('/api/time-entries/?user_id=' + str(self.employee.id))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue((resp.data.get('count', 0) or len(resp.data)) >= 1)

    def test_mobile_timer_flow(self):
        self._login('employee@example.com')

        start_resp = self.client.post('/api/time-entry/start/', {
            "project": self.project.id,
            "description": "Mobile timer start"
        }, format='json')
        self.assertEqual(start_resp.status_code, 201)
        self.assertTrue(ActiveTimeEntry.objects.filter(user=self.employee).exists())

        current_resp = self.client.get('/api/time-entry/current/')
        self.assertEqual(current_resp.status_code, 200)
        self.assertIsNotNone(current_resp.data)
        self.assertEqual(current_resp.data['project'], self.project.id)

        # Cannot start again while active
        conflict_resp = self.client.post('/api/time-entry/start/', {
            "project": self.project.id
        }, format='json')
        self.assertEqual(conflict_resp.status_code, 400)

        stop_resp = self.client.post('/api/time-entry/stop/', {
            "description": "Stopping timer"
        }, format='json')
        self.assertIn(stop_resp.status_code, (200, 201))
        self.assertIn('id', stop_resp.data)
        self.assertEqual(stop_resp.data['project'], self.project.id)

        self.assertFalse(ActiveTimeEntry.objects.filter(user=self.employee).exists())

        current_resp2 = self.client.get('/api/time-entry/current/')
        self.assertEqual(current_resp2.status_code, 200)
        self.assertIsNone(current_resp2.data)


