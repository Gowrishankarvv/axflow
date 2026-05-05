from __future__ import annotations

from django.conf import settings
from django.db import models


class SlackUserThread(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="slack_task_thread")
    channel_id = models.CharField(max_length=64)
    parent_ts = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["channel_id", "parent_ts"], name="slack_thread_channel_ts_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.channel_id}:{self.parent_ts}"


class SlackTaskMessage(models.Model):
    task = models.OneToOneField("core.Task", on_delete=models.CASCADE, related_name="slack_task_message")
    user_thread = models.ForeignKey(SlackUserThread, on_delete=models.CASCADE, related_name="task_messages")
    message_ts = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user_thread", "is_active"], name="slk_tmsg_thr_act_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.task_id}:{self.message_ts}"


class SlackChannelRegistration(models.Model):
    channel_id = models.CharField(max_length=64, unique=True)
    channel_name = models.CharField(max_length=120, blank=True, default="")
    created_by_slack_user_id = models.CharField(max_length=64, blank=True, default="")
    created_by_slack_username = models.CharField(max_length=120, blank=True, default="")
    last_command_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["channel_id"], name="slk_chanreg_chan_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.channel_id}:{self.channel_name}"


class SlackChannelEmailSubscription(models.Model):
    channel = models.ForeignKey(SlackChannelRegistration, on_delete=models.CASCADE, related_name="email_subscriptions")
    email = models.EmailField()
    app_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="slack_channel_subscriptions",
    )
    slack_user_ref = models.CharField(max_length=128, blank=True, default="")
    added_by_slack_user_id = models.CharField(max_length=64, blank=True, default="")
    added_by_slack_username = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["channel", "email"], name="slk_sub_channel_email_uq"),
        ]
        indexes = [
            models.Index(fields=["email", "is_active"], name="slk_sub_email_active_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.channel.channel_id}:{self.email}"


class SlackChannelSubscriptionProject(models.Model):
    subscription = models.ForeignKey(
        SlackChannelEmailSubscription,
        on_delete=models.CASCADE,
        related_name="project_subscriptions",
    )
    project = models.ForeignKey("core.Project", on_delete=models.CASCADE, related_name="slack_channel_subscriptions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["subscription", "project"], name="slk_sub_proj_unique"),
        ]
        indexes = [
            models.Index(fields=["subscription"], name="slk_sub_proj_sub_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.subscription_id}:{self.project_id}"


class SlackStandupParent(models.Model):
    channel = models.ForeignKey(SlackChannelRegistration, on_delete=models.CASCADE, related_name="standup_parents")
    email = models.EmailField()
    app_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="slack_standup_parents",
    )
    slack_user_ref = models.CharField(max_length=128, blank=True, default="")
    parent_ts = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["channel", "email"], name="slk_stndp_chan_email_uq"),
        ]
        indexes = [
            models.Index(fields=["channel", "is_active"], name="slk_stndp_chan_act_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.channel.channel_id}:{self.email}:{self.parent_ts}"


class SlackStandupTaskMessage(models.Model):
    standup_parent = models.ForeignKey(SlackStandupParent, on_delete=models.CASCADE, related_name="task_messages")
    task = models.ForeignKey("core.Task", on_delete=models.CASCADE, related_name="slack_standup_messages")
    message_ts = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)
    last_comment = models.TextField(blank=True, default="")
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["standup_parent", "task"], name="slk_stndp_parent_task_uq"),
        ]
        indexes = [
            models.Index(fields=["message_ts"], name="slk_stndp_msgts_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.standup_parent_id}:{self.task_id}:{self.message_ts}"
