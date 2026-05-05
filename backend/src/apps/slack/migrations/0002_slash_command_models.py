from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("slack", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SlackChannelRegistration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("channel_id", models.CharField(max_length=64, unique=True)),
                ("channel_name", models.CharField(blank=True, default="", max_length=120)),
                ("created_by_slack_user_id", models.CharField(blank=True, default="", max_length=64)),
                ("created_by_slack_username", models.CharField(blank=True, default="", max_length=120)),
                ("last_command_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="SlackChannelEmailSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                ("slack_user_ref", models.CharField(blank=True, default="", max_length=128)),
                ("added_by_slack_user_id", models.CharField(blank=True, default="", max_length=64)),
                ("added_by_slack_username", models.CharField(blank=True, default="", max_length=120)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "app_user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="slack_channel_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "channel",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_subscriptions",
                        to="slack.slackchannelregistration",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="slackchannelregistration",
            index=models.Index(fields=["channel_id"], name="slk_chanreg_chan_idx"),
        ),
        migrations.AddConstraint(
            model_name="slackchannelemailsubscription",
            constraint=models.UniqueConstraint(fields=("channel", "email"), name="slk_sub_channel_email_uq"),
        ),
        migrations.AddIndex(
            model_name="slackchannelemailsubscription",
            index=models.Index(fields=["email", "is_active"], name="slk_sub_email_active_idx"),
        ),
    ]

