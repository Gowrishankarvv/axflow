from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_squashed_0029_client_logo"),
        ("slack", "0003_standup_models"),
    ]

    operations = [
        migrations.CreateModel(
            name="SlackChannelSubscriptionProject",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slack_channel_subscriptions",
                        to="core.project",
                    ),
                ),
                (
                    "subscription",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_subscriptions",
                        to="slack.slackchannelemailsubscription",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="slackchannelsubscriptionproject",
            constraint=models.UniqueConstraint(fields=("subscription", "project"), name="slk_sub_proj_unique"),
        ),
        migrations.AddIndex(
            model_name="slackchannelsubscriptionproject",
            index=models.Index(fields=["subscription"], name="slk_sub_proj_sub_idx"),
        ),
    ]

