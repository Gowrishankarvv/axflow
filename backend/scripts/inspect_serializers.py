import os
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['DJANGO_SETTINGS_MODULE'] = 'timetrack.settings'

from django.conf import settings
print('INSTALLED_APPS contains core:', 'core' in settings.INSTALLED_APPS)
from core.serializers import TaskSerializer
fields = TaskSerializer().get_fields()
print('assignees field:', type(fields['assignees']), 'many=', getattr(fields['assignees'], 'many', None))
print('assignees source:', getattr(fields['assignees'], 'source', None))
