from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    """Adds the 'leave_submitted' choice to Notification.kind.

    No DB schema change — CharField doesn't enforce choices at the DB level —
    but Django requires a migration to keep model state and migration history
    in sync for admin/form validation.
    """
    dependencies = [
        ("core", "0006_notification"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("request_submitted", "Data Request Submitted"),
                    ("leave_submitted", "Leave Request Submitted"),
                ],
                max_length=50,
            ),
        ),
    ]
