from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.core.cache import cache
from django.conf import settings
from django.db import models
from datetime import timedelta
from .models import User, TimeEntry, Task, ClockSession, Project, DataRequest, Notification, LeaveRequest, SalaryPayment

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


@receiver(post_save, sender=DataRequest)
def notify_on_new_data_request(sender, instance, created, **kwargs):
    """Fan out an in-app Notification to managers + superusers when a new
    data request is submitted. Excludes the requester themselves (no one
    needs a "you submitted a request" notification)."""
    if not created:
        return

    requester = instance.requester
    recipients = User.objects.filter(
        role__in=["manager", "superuser"], is_active=True,
    )
    if requester:
        recipients = recipients.exclude(id=requester.id)

    requester_name = (
        (requester.first_name or requester.username) if requester else "Someone"
    )
    title = "New data request submitted"
    message = f"{requester_name} submitted: {instance.title or 'Untitled request'}"

    Notification.objects.bulk_create([
        Notification(
            user=u,
            actor=requester,
            kind="request_submitted",
            title=title,
            message=message,
            link="/requests",
        )
        for u in recipients
    ])


@receiver(post_save, sender=LeaveRequest)
def notify_on_new_leave_request(sender, instance, created, **kwargs):
    """Fan out an in-app Notification to managers + superusers when an employee
    submits a leave request. The approval UI lives inside /requests (under the
    "Leave Requests" tab), so the click-through targets that path."""
    if not created:
        return

    requester = instance.user
    recipients = User.objects.filter(
        role__in=["manager", "superuser"], is_active=True,
    )
    if requester:
        recipients = recipients.exclude(id=requester.id)

    requester_name = (
        (requester.first_name or requester.username) if requester else "Someone"
    )
    days = instance.total_days
    day_word = "day" if days == 1 else "days"
    title = "New leave request submitted"
    message = (
        f"{requester_name} requested {days} {day_word} off "
        f"({instance.start_date} → {instance.end_date})"
    )

    Notification.objects.bulk_create([
        Notification(
            user=u,
            actor=requester,
            kind="leave_submitted",
            title=title,
            message=message,
            link="/requests",
        )
        for u in recipients
    ])


# --- Leave approve / reject → notify the requester --------------------------
# We need to know the *previous* status to detect the transition. pre_save
# stashes the old value on the instance; post_save inspects it and decides
# whether to fan out a notification.

@receiver(pre_save, sender=LeaveRequest)
def _capture_old_leave_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = LeaveRequest.objects.only("status").get(pk=instance.pk)
            instance._old_status = old.status
        except LeaveRequest.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


@receiver(post_save, sender=LeaveRequest)
def notify_on_leave_decision(sender, instance, created, **kwargs):
    """When a leave transitions pending → approved / rejected, drop an
    in-app notification into the requester's inbox."""
    if created:
        return  # the "new leave submitted" handler covers this case
    old_status = getattr(instance, "_old_status", None)
    if old_status == instance.status:
        return  # not a status change
    if instance.status not in ("approved", "rejected"):
        return  # we only notify on these two transitions
    if not instance.user_id:
        return  # nobody to notify

    days = instance.total_days
    day_word = "day" if days == 1 else "days"
    decided_by_name = (
        (instance.decided_by.first_name or instance.decided_by.username)
        if instance.decided_by else "your manager"
    )

    if instance.status == "approved":
        kind = "leave_approved"
        title = "Leave request approved"
        bits = [
            f"Your {days}-{day_word} leave ({instance.start_date} → {instance.end_date}) was approved by {decided_by_name}.",
        ]
        if instance.leave_type:
            bits.append(f"Type: {instance.leave_type.capitalize()}.")
        if instance.is_salary_cut:
            bits.append("Marked as salary-cut.")
        message = " ".join(bits)
    else:  # rejected
        kind = "leave_rejected"
        title = "Leave request rejected"
        message = (
            f"Your {days}-{day_word} leave ({instance.start_date} → {instance.end_date}) "
            f"was rejected by {decided_by_name}."
        )
        if instance.rejection_reason:
            message += f' Reason: "{instance.rejection_reason}"'

    Notification.objects.create(
        user=instance.user,
        actor=instance.decided_by,
        kind=kind,
        title=title,
        message=message,
        link="/leave",
    )


# --- Salary processed → notify the employee to confirm receipt --------------

@receiver(post_save, sender=SalaryPayment)
def notify_on_salary_processed(sender, instance, created, **kwargs):
    """When a new SalaryPayment is created, ping the employee so they can
    approve once the money lands in their account."""
    if not created:
        return
    if not instance.employee_id:
        return

    amount_str = f"{instance.amount}"
    period = ""
    if instance.period_month and instance.period_year:
        try:
            from calendar import month_name
            period = f" for {month_name[instance.period_month]} {instance.period_year}"
        except Exception:
            period = ""

    Notification.objects.create(
        user=instance.employee,
        actor=instance.processed_by,
        kind="salary_processed",
        title="Salary processed — please confirm",
        message=(
            f"Your salary of ₹{amount_str}{period} has been processed. "
            "Please approve once the amount is credited to your account."
        ),
        link="/notifications",
    )
