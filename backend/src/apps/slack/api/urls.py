from django.urls import path

from .views import SlackBotHealthView, SlackEventsView
from apps.slack.slash_commands.views import SharkSlashCommandView
from apps.slack.task_tracker.views import SlackTaskTrackerInteractionsView, SlackTaskTrackerSyncView

urlpatterns = [
    path("health/", SlackBotHealthView.as_view(), name="slack-health"),
    path("health", SlackBotHealthView.as_view(), name="slack-health-no-slash"),
    path("events/", SlackEventsView.as_view(), name="slack-events"),
    path("events", SlackEventsView.as_view(), name="slack-events-no-slash"),
    path("slash-commands/shark/", SharkSlashCommandView.as_view(), name="slack-shark-slash-command"),
    path("slash-commands/shark", SharkSlashCommandView.as_view(), name="slack-shark-slash-command-no-slash"),
    path("task-tracker/sync/", SlackTaskTrackerSyncView.as_view(), name="slack-task-tracker-sync"),
    path("task-tracker/sync", SlackTaskTrackerSyncView.as_view(), name="slack-task-tracker-sync-no-slash"),
    path("task-tracker/interactions/", SlackTaskTrackerInteractionsView.as_view(), name="slack-task-tracker-interactions"),
    path("task-tracker/interactions", SlackTaskTrackerInteractionsView.as_view(), name="slack-task-tracker-interactions-no-slash"),
]
