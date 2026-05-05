from django.test import TransactionTestCase
from django.utils import timezone
from django.db import connection
from tables import User, Project, TimeEntry
from datetime import timedelta
import time

class MaterializedViewTest(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='testuser@Axinortech.com',
            password='password',
            role='employee'
        )
        self.project = Project.objects.create(name='Test Project', created_by=self.user)

    def test_materialized_view_refresh(self):
        # Initial state: view should be empty or 0
        with connection.cursor() as cursor:
            cursor.execute("SELECT SUM(total_duration) FROM core_timeentry_daily_totals WHERE user_id = %s", [self.user.id])
            row = cursor.fetchone()
            initial_total = row[0] if row and row[0] else timedelta(0)

        # Create a time entry
        start = timezone.now()
        end = start + timedelta(hours=1)
        TimeEntry.objects.create(
            user=self.user,
            project=self.project,
            start_datetime=start,
            end_datetime=end,
            duration=timedelta(hours=1),
            description="Test Entry"
        )

        # Manually refresh the materialized view
        with connection.cursor() as cursor:
            cursor.execute("REFRESH MATERIALIZED VIEW core_timeentry_daily_totals")
            
        # Check view again
        with connection.cursor() as cursor:
            cursor.execute("SELECT SUM(total_duration) FROM core_timeentry_daily_totals WHERE user_id = %s", [self.user.id])
            row = cursor.fetchone()
            new_total = row[0] if row and row[0] else timedelta(0)

        # Verify the view updated
        self.assertEqual(new_total, initial_total + timedelta(hours=1))
