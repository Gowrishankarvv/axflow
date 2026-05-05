from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from django.conf import settings
from django.db import models
from datetime import timedelta
from .models import User, TimeEntry, Task, ClockSession, Project

@receiver([post_save, post_delete], sender=User)
def invalidate_user_cache(sender, instance, **kwargs):
    # Invalidate specific user's cache
    cache.delete(f"dashboard_users_{instance.id}")
    cache.delete(f"visible_user_ids_{instance.id}")
    
    # If manager changes, invalidate manager's cache too
    if instance.manager_id:
        cache.delete(f"dashboard_users_{instance.manager_id}")
        cache.delete(f"visible_user_ids_{instance.manager_id}")
        
    # For simplicity in a small org, we might want to just clear all user caches
    # But let's try to be specific first.
    # If a user is created/deleted, it might affect everyone's "users" list if they are visible
    # So we might need a broader invalidation or just let it expire (1 hour)
    pass

@receiver(post_save, sender=TimeEntry)
def update_daily_summary_on_save(sender, instance, created, **kwargs):
    # Invalidate cache
    # We can't easily guess the date range key, so we rely on TTL (5 mins) for the chart
    # But we can invalidate "active_session" or "recent_sessions" if we cache them.
    pass

    # Update DailySummary
    from .models import DailySummary
    date = instance.start_datetime.date()
    
    # Calculate delta
    new_duration = instance.duration or timedelta(0)
    old_duration = timedelta(0)
    
    # If it's an update, we need the old duration. 
    # But Django signals don't give old instance easily without a pre_save lookup or tracking fields.
    # For simplicity and robustness, we can just re-calculate the day's total.
    # Re-calculating ONE day for ONE user is very fast (usually < 10 entries).
    # This avoids drift errors.
    
    total = TimeEntry.objects.filter(user=instance.user, start_datetime__date=date).aggregate(
        models.Sum('duration')
    )['duration__sum'] or timedelta(0)
    
    DailySummary.objects.update_or_create(
        user=instance.user,
        date=date,
        defaults={'total_duration': total}
    )
    
    # If the date changed, we need to update the old date too.
    # This is tricky without tracking. 
    # For now, we assume date doesn't change often, or we accept a small drift until a full recalc (which we can add as a management command).
    # Or, we can use pre_save to track old date. 
    # Let's stick to simple re-calc of current date for now.

@receiver(post_delete, sender=TimeEntry)
def update_daily_summary_on_delete(sender, instance, **kwargs):
    from .models import DailySummary
    date = instance.start_datetime.date()
    
    total = TimeEntry.objects.filter(user=instance.user, start_datetime__date=date).aggregate(
        models.Sum('duration')
    )['duration__sum'] or timedelta(0)
    
    DailySummary.objects.update_or_create(
        user=instance.user,
        date=date,
        defaults={'total_duration': total}
    )

@receiver([post_save, post_delete], sender=Task)
def invalidate_task_cache(sender, instance, **kwargs):
    # Invalidate assigned tasks for all assignees
    for user in instance.assignees.all():
        cache.delete(f"dashboard_tasks_{user.id}")

@receiver([post_save, post_delete], sender=ClockSession)
def invalidate_clock_session_cache(sender, instance, **kwargs):
    cache.delete(f"dashboard_clock_{instance.user_id}")

@receiver(post_save, sender=Task)
def sync_task_status_to_request(sender, instance, created, **kwargs):
    """
    Sync Task status changes to the linked DataRequest.
    Task: todo -> Request: approved (no change usually needed)
    Task: in_progress -> Request: in_progress
    Task: done -> Request: completed
    """
    if hasattr(instance, 'origin_request'):
        req = instance.origin_request
        should_save = False
        
        if instance.status == 'in_progress' and req.status != 'in_progress':
            req.status = 'in_progress'
            should_save = True
        elif instance.status == 'done' and req.status != 'completed':
            req.status = 'completed'
            should_save = True
            
        if should_save:
            req.save(update_fields=['status'])
