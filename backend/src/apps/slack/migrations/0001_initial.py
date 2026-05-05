from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0001_squashed_0029_client_logo"),
    ]

    operations = [
        migrations.CreateModel(
            name="SlackUserThread",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("channel_id", models.CharField(max_length=64)),
                ("parent_ts", models.CharField(max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                ("last_synced_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_task_thread",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="SlackTaskMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("message_ts", models.CharField(max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "task",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_task_message",
                        to="core.task",
                    ),
                ),
                (
                    "user_thread",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="task_messages",
                        to="slack.slackuserthread",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="slackuserthread",
            index=models.Index(fields=["channel_id", "parent_ts"], name="slack_thread_channel_ts_idx"),
        ),
        migrations.AddIndex(
            model_name="slacktaskmessage",
            index=models.Index(fields=["user_thread", "is_active"], name="slk_tmsg_thr_act_idx"),
        ),
    ]
