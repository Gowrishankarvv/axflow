from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("slack", "0002_slash_command_models"),
        ("core", "0001_squashed_0029_client_logo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SlackStandupParent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                ("slack_user_ref", models.CharField(blank=True, default="", max_length=128)),
                ("parent_ts", models.CharField(max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                ("last_synced_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "app_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slack_standup_parents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "channel",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="standup_parents",
                        to="slack.slackchannelregistration",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="SlackStandupTaskMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("message_ts", models.CharField(max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                ("last_comment", models.TextField(blank=True, default="")),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "standup_parent",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="task_messages",
                        to="slack.slackstandupparent",
                    ),
                ),
                (
                    "task",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_standup_messages",
                        to="core.task",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="slackstandupparent",
            constraint=models.UniqueConstraint(fields=("channel", "email"), name="slk_stndp_chan_email_uq"),
        ),
        migrations.AddIndex(
            model_name="slackstandupparent",
            index=models.Index(fields=["channel", "is_active"], name="slk_stndp_chan_act_idx"),
        ),
        migrations.AddConstraint(
            model_name="slackstanduptaskmessage",
            constraint=models.UniqueConstraint(fields=("standup_parent", "task"), name="slk_stndp_parent_task_uq"),
        ),
        migrations.AddIndex(
            model_name="slackstanduptaskmessage",
            index=models.Index(fields=["message_ts"], name="slk_stndp_msgts_idx"),
        ),
    ]

