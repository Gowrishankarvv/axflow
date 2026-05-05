from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone
from tables import TimeEntry, DailySummary, User
from datetime import timedelta

class Command(BaseCommand):
    help = 'Refreshes materialized views and backfills DailySummary table'

    def handle(self, *args, **options):
        self.stdout.write("Refreshing materialized views...")
        with connection.cursor() as cursor:
            cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY core_timeentry_daily_totals;")
            cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY core_project_monthly_totals;")
        self.stdout.write(self.style.SUCCESS("Materialized views refreshed."))

        self.stdout.write("Backfilling DailySummary table...")
        # 1. Clear existing summaries (optional, but safer for full rebuild)
        # DailySummary.objects.all().delete() 
        # Actually, let's just update/create to be safe and keep history if we want.
        
        # 2. Aggregate all time entries by user and date
        # This might be heavy, so let's do it efficiently.
        # We can use the materialized view we just refreshed!
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id, day, total_duration FROM core_timeentry_daily_totals")
            rows = cursor.fetchall()
            
        self.stdout.write(f"Found {len(rows)} daily summaries to process.")
        
        batch_size = 1000
        batch = []
        count = 0
        
        for user_id, day, total_duration in rows:
            # total_duration is a timedelta or similar from driver
            if isinstance(total_duration, timedelta):
                duration = total_duration
            else:
                # Handle potential other types (though psycopg2 usually returns timedelta)
                duration = total_duration

            batch.append(DailySummary(
                user_id=user_id,
                date=day,
                total_duration=duration
            ))
            
            if len(batch) >= batch_size:
                self._upsert_batch(batch)
                count += len(batch)
                self.stdout.write(f"Processed {count} records...")
                batch = []
                
        if batch:
            self._upsert_batch(batch)
            count += len(batch)
            
        self.stdout.write(self.style.SUCCESS(f"Successfully backfilled {count} DailySummary records."))

    def _upsert_batch(self, batch):
        # Bulk create or update
        # Django 4.1+ supports bulk_create with update_conflicts
        # Assuming recent Django version based on async mentions, but let's check.
        # If not, we iterate.
        # Let's try bulk_create with update_conflicts=True (Postgres)
        
        try:
            DailySummary.objects.bulk_create(
                batch,
                update_conflicts=True,
                unique_fields=['user', 'date'],
                update_fields=['total_duration']
            )
        except TypeError:
            # Fallback for older Django versions
            for item in batch:
                DailySummary.objects.update_or_create(
                    user_id=item.user_id,
                    date=item.date,
                    defaults={'total_duration': item.total_duration}
                )
