from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from datetime import timedelta
from tables import TimeEntry, TimeEntryDailySummary


class Command(BaseCommand):
    help = "Backfill TimeEntryDailySummary table with historical data from TimeEntry"

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Number of entries to process in each batch'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        batch_size = options['batch_size']
        dry_run = options['dry_run']

        self.stdout.write('Starting backfill of TimeEntryDailySummary...')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Get all unique date/user/project/task combinations from TimeEntry
        combinations = TimeEntry.objects.values(
            'start_datetime__date',
            'user',
            'project',
            'task'
        ).distinct()

        total_combinations = combinations.count()
        self.stdout.write(f'Found {total_combinations} unique date/user/project/task combinations')

        processed = 0
        created = 0
        updated = 0

        for combo in combinations.iterator(chunk_size=batch_size):
            processed += 1

            if processed % 100 == 0:
                self.stdout.write(f'Processed {processed}/{total_combinations} combinations...')

            date = combo['start_datetime__date']
            user_id = combo['user']
            project_id = combo['project']
            task_id = combo['task']

            # Calculate total duration for this combination
            total_duration = TimeEntry.objects.filter(
                start_datetime__date=date,
                user_id=user_id,
                project_id=project_id,
                task_id=task_id
            ).aggregate(total=Sum('duration'))['total'] or timedelta()

            if dry_run:
                self.stdout.write(f'Would {"create" if not TimeEntryDailySummary.objects.filter(date=date, user_id=user_id, project_id=project_id, task_id=task_id).exists() else "update"} summary for {date} user:{user_id} project:{project_id} task:{task_id or "None"} with duration {total_duration}')
                continue

            # Create or update the summary
            summary, created_flag = TimeEntryDailySummary.objects.get_or_create(
                date=date,
                user_id=user_id,
                project_id=project_id,
                task_id=task_id,
                defaults={'total_duration': total_duration}
            )

            if created_flag:
                created += 1
            else:
                if summary.total_duration != total_duration:
                    summary.total_duration = total_duration
                    summary.save(update_fields=['total_duration'])
                    updated += 1

        if not dry_run:
            # Now calculate prefix sums for all combinations
            self.stdout.write('Calculating prefix sums...')
            self._calculate_all_prefix_sums()

        self.stdout.write(self.style.SUCCESS(
            f'Backfill completed. Created: {created}, Updated: {updated}, Total processed: {processed}'
        ))

    def _calculate_all_prefix_sums(self):
        """Calculate prefix sums for all user/project/task combinations."""
        from django.db.models import Q

        # Get all unique user/project/task combinations
        combinations = TimeEntryDailySummary.objects.values(
            'user', 'project', 'task'
        ).distinct()

        for combo in combinations:
            user_id = combo['user']
            project_id = combo['project']
            task_id = combo['task']

            # Get all summaries for this combination ordered by date
            summaries = TimeEntryDailySummary.objects.filter(
                user_id=user_id,
                project_id=project_id,
                task_id=task_id
            ).order_by('date')

            current_prefix = timedelta()

            for summary in summaries:
                current_prefix += summary.total_duration
                summary.prefix_sum = current_prefix
                summary.save(update_fields=['prefix_sum'])

        self.stdout.write('Prefix sums calculated for all combinations')
