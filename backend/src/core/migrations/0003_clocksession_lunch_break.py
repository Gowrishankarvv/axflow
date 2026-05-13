from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_project_and_task_dates_and_pending_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="clocksession",
            name="lunch_start_time",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="clocksession",
            name="lunch_end_time",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
