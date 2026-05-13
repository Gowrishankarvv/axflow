from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    """Adds leave_approved + leave_rejected to Notification.kind choices."""
    dependencies = [
        ("core", "0007_notification_kind_leave_submitted"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("request_submitted", "Data Request Submitted"),
                    ("leave_submitted", "Leave Request Submitted"),
                    ("leave_approved", "Leave Request Approved"),
                    ("leave_rejected", "Leave Request Rejected"),
                ],
                max_length=50,
            ),
        ),
    ]
