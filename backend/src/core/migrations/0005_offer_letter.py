from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_leave_request"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="OfferLetter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("recipient_email_snapshot", models.EmailField(blank=True, max_length=254)),
                ("recipient_name_snapshot", models.CharField(blank=True, max_length=200)),
                ("subject", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("attachment", models.FileField(upload_to="offer_letters/%Y/%m/%d/")),
                ("sent_at", models.DateTimeField(auto_now_add=True)),
                ("status", models.CharField(choices=[("sent", "Sent"), ("failed", "Failed")], default="sent", max_length=20)),
                ("error_message", models.TextField(blank=True)),
                (
                    "recipient",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="received_offers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "sent_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="sent_offers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-sent_at"]},
        ),
        migrations.AddIndex(
            model_name="offerletter",
            index=models.Index(fields=["recipient", "sent_at"], name="offer_recipient_sent_idx"),
        ),
        migrations.AddIndex(
            model_name="offerletter",
            index=models.Index(fields=["status", "sent_at"], name="offer_status_sent_idx"),
        ),
    ]
