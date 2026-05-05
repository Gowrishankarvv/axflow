from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, cast

import pytz
from django.core.cache import cache
from django.db import connection
from django.db.models import Exists, OuterRef, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.selectors import build_visible_user_ids
from tables import (
    ClockSession,
    DailySummary,
    Project,
    Task,
    TimeEntry,
    User,
    get_active_clock_session_for_user,
    get_daily_summaries_for_user,
    get_open_tasks_for_user,
    get_recent_clock_sessions_for_user,
)
from core.serializers import ClockSessionSerializer, TaskSerializer, TimeEntrySerializer


def dictfetchall(cursor):
    columns = [column[0] for column in cursor.description]
    return [{column: value for column, value in zip(columns, row)} for row in cursor.fetchall()]


def _get_query_str(request: Request, key: str, default: str | None = None) -> str | None:
    value = request.query_params.get(key, default)
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
    else:
        value = str(value)
    return value or None


class DashboardSummaryAggregatedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)

        start_date_param = _get_query_str(request, "start_date")
        end_date_param = _get_query_str(request, "end_date")

        tz = pytz.timezone("Asia/Kolkata")
        now_ist = timezone.now().astimezone(tz)
        today = now_ist.date()

        try:
            start_date = datetime.fromisoformat(start_date_param).date() if start_date_param else today.replace(day=1)
        except ValueError:
            return Response({"detail": "Invalid start_date format"}, status=400)
        try:
            end_date = datetime.fromisoformat(end_date_param).date() if end_date_param else today
        except ValueError:
            return Response({"detail": "Invalid end_date format"}, status=400)

        if end_date > today:
            end_date = today
        if start_date > end_date:
            start_date = end_date

        visible_user_ids = None
        if not (user.is_superuser or user.role == "superuser"):
            visible_user_ids = list(build_visible_user_ids(user))

        def _seconds_from_value(value: Any) -> float:
            if isinstance(value, timedelta):
                return value.total_seconds()
            if value is None:
                return 0.0
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0

        def _fetch_daily_totals(local_start_date: date, local_end_date: date, visible_ids: list[int] | None):
            s_dt = tz.localize(datetime.combine(local_start_date, time.min))
            e_dt = tz.localize(datetime.combine(local_end_date, time.max))

            qs = TimeEntry.objects.filter(start_datetime__range=(s_dt, e_dt))
            if visible_ids:
                qs = qs.filter(user_id__in=visible_ids)

            return qs.annotate(day=TruncDate("start_datetime", tzinfo=tz)).values("day").annotate(total_duration=Sum("duration")).order_by("day")

        def _fetch_project_totals(local_end_date: date, visible_ids: list[int] | None):
            month_start = local_end_date.replace(day=1)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            s_dt = tz.localize(datetime.combine(month_start, time.min))
            e_dt = tz.localize(datetime.combine(month_end, time.max))

            qs = TimeEntry.objects.filter(start_datetime__range=(s_dt, e_dt))
            if visible_ids:
                qs = qs.filter(user_id__in=visible_ids)
            return qs.values("project_id").annotate(total_duration=Sum("duration"))

        def _format_project_totals(project_rows: list[dict[str, Any]]):
            project_ids = [row["project_id"] for row in project_rows if row.get("project_id")]
            projects_map = {project.id: project.name for project in Project.objects.filter(id__in=project_ids)}
            return [
                {
                    "project_id": row["project_id"],
                    "project_name": projects_map.get(row["project_id"], "Unknown Project"),
                    "hours": round(_seconds_from_value(row["total_duration"]) / 3600.0, 2),
                }
                for row in project_rows
            ]

        def _build_threshold_notifications(projects: list[dict[str, Any]]):
            project_ids = [project["project_id"] for project in projects]
            thresholds = {project.id: float(project.monthly_threshold_hours or 0) for project in Project.objects.filter(id__in=project_ids)}
            result = []
            for project in projects:
                threshold = thresholds.get(project["project_id"], 0.0)
                if threshold and project["hours"] > threshold:
                    result.append(
                        {
                            "project_id": project["project_id"],
                            "project_name": project["project_name"],
                            "threshold": threshold,
                            "current_hours": project["hours"],
                            "exceeded_by": round(project["hours"] - threshold, 2),
                        }
                    )
            return result

        qp_user_id = request.query_params.get("user_id")
        team_view = request.query_params.get("team") in ("1", "true", "True")
        target_user_ids = None

        if team_view:
            if not (user.is_superuser or user.role == "superuser"):
                target_user_ids = list(build_visible_user_ids(user))
        elif qp_user_id:
            if qp_user_id == "me":
                target_user_ids = [user.id]
            else:
                try:
                    target_user_ids = [int(qp_user_id)]
                except ValueError:
                    return Response({"detail": "Invalid user_id"}, status=400)
        elif user.role == "employee" and not user.is_superuser:
            target_user_ids = [user.id]
        else:
            if not (user.is_superuser or user.role == "superuser"):
                target_user_ids = list(build_visible_user_ids(user))

        cache_key = f"dashboard_summary_v2_{user.id}_{start_date}_{end_date}_{team_view}_{qp_user_id}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

        week_start_date = end_date - timedelta(days=end_date.weekday())
        fetch_start_date = week_start_date if week_start_date < start_date else start_date

        daily_rows = _fetch_daily_totals(fetch_start_date, end_date, target_user_ids)
        full_chart = [{"date": row["day"].isoformat(), "hours": round(_seconds_from_value(row["total_duration"]) / 3600.0, 2)} for row in daily_rows]

        today_iso = end_date.isoformat()
        start_iso = start_date.isoformat()
        week_start_iso = week_start_date.isoformat()
        today_hours = next((entry["hours"] for entry in full_chart if entry["date"] == today_iso), 0.0)
        week_hours = sum(entry["hours"] for entry in full_chart if week_start_iso <= entry["date"] <= today_iso)
        month_hours = sum(entry["hours"] for entry in full_chart if entry["date"] >= start_iso)
        totals = {"today": round(today_hours, 2), "week": round(week_hours, 2), "month": round(month_hours, 2)}

        chart = [entry for entry in full_chart if entry["date"] >= start_iso]
        project_rows = _fetch_project_totals(end_date, target_user_ids)
        projects = _format_project_totals(project_rows)
        threshold_notifications = _build_threshold_notifications(projects)

        qs = TimeEntry.objects.all()
        if team_view:
            if visible_user_ids:
                qs = qs.filter(user_id__in=visible_user_ids)
        elif qp_user_id:
            qs = qs.filter(user_id=user.id if qp_user_id == "me" else qp_user_id)
        elif user.role == "employee" and not user.is_superuser:
            qs = qs.filter(user_id=user.id)
        else:
            if visible_user_ids:
                visible_entry_ids = TimeEntry.objects.filter(visible_to=user).values("id")
                qs = qs.filter(Q(user_id__in=visible_user_ids) | Q(id__in=visible_entry_ids))

        overlap_subquery = TimeEntry.objects.filter(
            user_id=OuterRef("user_id"),
            start_datetime__lt=OuterRef("end_datetime"),
            end_datetime__gt=OuterRef("start_datetime"),
        ).exclude(id=OuterRef("id"))

        recent_entries_qs = (
            qs.select_related("user", "project", "task", "manager_comment_by")
            .prefetch_related("tags")
            .annotate(has_overlap=Exists(overlap_subquery))
            .order_by("-start_datetime", "-created_at")[:20]
        )
        recent_entries = TimeEntrySerializer(recent_entries_qs, many=True, context={"request": request}).data

        assigned_tasks = []
        try:
            if user.is_superuser or user.role in ("superuser", "manager", "employee"):
                t_qs = Task.objects.select_related("project", "created_by").prefetch_related("assignees").filter(status__in=["todo", "in_progress"])
                if qp_user_id and qp_user_id != "me":
                    t_qs = t_qs.filter(assignees__id=qp_user_id)
                else:
                    t_qs = t_qs.filter(assignees__id=user.id)
                assigned_tasks = TaskSerializer(t_qs[:20], many=True, context={"request": request}).data
        except Exception:
            assigned_tasks = []

        response_data = {
            "totals": totals,
            "chart": chart,
            "recent_entries": recent_entries,
            "projects": projects,
            "assigned_tasks": assigned_tasks,
            "threshold_notifications": threshold_notifications,
            "meta": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "generated_at": now_ist.isoformat(),
            },
        }

        cache.set(cache_key, response_data, 60 * 5)
        return Response(response_data)


class DashboardAggregatedMaterializedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)
        if not (user.is_superuser or user.role in ("superuser", "manager")):
            return Response({"detail": "Forbidden"}, status=403)

        start_date_param = _get_query_str(request, "start_date")
        end_date_param = _get_query_str(request, "end_date")
        today = timezone.now().date()

        try:
            start_date = datetime.fromisoformat(start_date_param).date() if start_date_param else today.replace(day=1)
        except ValueError:
            return Response({"detail": "Invalid start_date format"}, status=400)
        try:
            end_date = datetime.fromisoformat(end_date_param).date() if end_date_param else today
        except ValueError:
            return Response({"detail": "Invalid end_date format"}, status=400)

        if end_date > today:
            end_date = today
        if start_date > end_date:
            start_date = end_date

        visible_user_ids = None
        if not (user.is_superuser or user.role == "superuser"):
            visible_user_ids = list(build_visible_user_ids(user))

        daily_rows = self._fetch_daily_totals(start_date, end_date, visible_user_ids)
        chart = [{"date": row["day"].isoformat(), "hours": round(self._seconds_from_value(row["total_duration"]) / 3600.0, 2)} for row in daily_rows]
        totals = self._build_totals(chart, end_date)

        per_user_rows = self._fetch_user_totals(start_date, end_date, visible_user_ids)
        per_user_hours = self._format_user_hours(per_user_rows)

        project_rows = self._fetch_project_totals(end_date, visible_user_ids)
        projects = self._format_project_totals(project_rows)
        threshold_notifications = self._build_threshold_notifications(projects)

        return Response(
            {
                "totals": totals,
                "chart": chart,
                "projects": projects,
                "per_user_hours": per_user_hours,
                "assigned_tasks": [],
                "threshold_notifications": threshold_notifications,
                "meta": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "generated_at": timezone.now().isoformat(),
                },
            }
        )

    def _fetch_daily_totals(self, start_date: date, end_date: date, visible_ids: list[int] | None):
        params: list[Any] = [start_date, end_date]
        filter_clause = ""
        if visible_ids:
            filter_clause = " AND user_id = ANY(%s)"
            params.append(visible_ids)
        sql = f"""
            SELECT day, SUM(total_duration) AS total_duration
            FROM core_timeentry_daily_totals
            WHERE day BETWEEN %s AND %s
            {filter_clause}
            GROUP BY day
            ORDER BY day
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return dictfetchall(cursor)

    def _fetch_user_totals(self, start_date: date, end_date: date, visible_ids: list[int] | None):
        params: list[Any] = [start_date, end_date]
        filter_clause = ""
        if visible_ids:
            filter_clause = " AND user_id = ANY(%s)"
            params.append(visible_ids)
        sql = f"""
            SELECT user_id, SUM(total_duration) AS total_duration
            FROM core_timeentry_daily_totals
            WHERE day BETWEEN %s AND %s
            {filter_clause}
            GROUP BY user_id
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return dictfetchall(cursor)

    def _fetch_project_totals(self, end_date: date, visible_ids: list[int] | None):
        month_start = end_date.replace(day=1)
        params: list[Any] = [month_start]
        filter_clause = ""
        if visible_ids:
            filter_clause = " AND user_id = ANY(%s)"
            params.append(visible_ids)
        sql = f"""
            SELECT project_id, SUM(total_duration) AS total_duration
            FROM core_project_monthly_totals
            WHERE month_start = %s
            {filter_clause}
            GROUP BY project_id
        """
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return dictfetchall(cursor)

    def _format_project_totals(self, project_rows: list[dict[str, Any]]):
        project_ids = [row["project_id"] for row in project_rows if row.get("project_id")]
        projects_map = {project.id: project.name for project in Project.objects.filter(id__in=project_ids)}
        return [
            {
                "project_id": row["project_id"],
                "project_name": projects_map.get(row["project_id"], "Unknown Project"),
                "hours": round(self._seconds_from_value(row["total_duration"]) / 3600.0, 2),
            }
            for row in project_rows
        ]

    def _format_user_hours(self, per_user_rows: list[dict[str, Any]]):
        user_ids = [row["user_id"] for row in per_user_rows if row.get("user_id")]
        users_map = {row.id: (row.first_name or row.username) for row in User.objects.filter(id__in=user_ids)}
        return [
            {
                "user_id": row["user_id"],
                "user_name": users_map.get(row["user_id"], "Unknown User"),
                "hours": round(self._seconds_from_value(row["total_duration"]) / 3600.0, 2),
            }
            for row in per_user_rows
        ]

    def _build_totals(self, chart: list[dict[str, Any]], end_date: date):
        today_iso = end_date.isoformat()
        today_hours = next((entry["hours"] for entry in chart if entry["date"] == today_iso), 0.0)
        week_start = end_date - timedelta(days=6)
        week_hours = sum(entry["hours"] for entry in chart if week_start.isoformat() <= entry["date"] <= today_iso)
        month_hours = sum(entry["hours"] for entry in chart)
        return {"today": round(today_hours, 2), "week": round(week_hours, 2), "month": round(month_hours, 2)}

    def _build_threshold_notifications(self, projects: list[dict[str, Any]]):
        project_ids = [project["project_id"] for project in projects]
        thresholds = {project.id: float(project.monthly_threshold_hours or 0) for project in Project.objects.filter(id__in=project_ids)}
        result = []
        for project in projects:
            threshold = thresholds.get(project["project_id"], 0.0)
            if threshold and project["hours"] > threshold:
                result.append(
                    {
                        "project_id": project["project_id"],
                        "project_name": project["project_name"],
                        "threshold": threshold,
                        "current_hours": project["hours"],
                        "exceeded_by": round(project["hours"] - threshold, 2),
                    }
                )
        return result

    def _seconds_from_value(self, value: Any) -> float:
        if isinstance(value, timedelta):
            return value.total_seconds()
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0


class DashboardInitView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request):
        user = cast(User, request.user)
        today = timezone.now().date()

        def get_clock_data():
            cache_key = f"dashboard_clock_{user.id}"
            data = cache.get(cache_key)
            if data is None:
                active_clock = get_active_clock_session_for_user(user.id)
                active_data = ClockSessionSerializer(active_clock).data if active_clock else None
                recent_sessions = get_recent_clock_sessions_for_user(user.id, limit=5).select_related("user")
                sessions_data = ClockSessionSerializer(recent_sessions, many=True).data
                sessions_count = ClockSession.objects.filter(user=user).count()
                data = {"active_session": active_data, "recent_sessions": {"results": sessions_data, "count": sessions_count}}
                cache.set(cache_key, data, timeout=60)
            return data

        def get_tasks_data():
            cache_key = f"dashboard_tasks_{user.id}"
            data = cache.get(cache_key)
            if data is None:
                assigned_tasks = (
                    get_open_tasks_for_user(user.id)
                    .select_related("project", "created_by")
                    .prefetch_related("assignees")
                    .order_by("due_date")[:100]
                )
                data = TaskSerializer(assigned_tasks, many=True).data
                cache.set(cache_key, data, timeout=300)
            return data

        def get_summary_data():
            cache_key = f"dashboard_summary_{user.id}_{today}"
            data = cache.get(cache_key)
            if data is None:
                start_date = today.replace(day=1)
                end_date = (start_date + timedelta(days=32)).replace(day=1) - timedelta(days=1)
                daily_rows = get_daily_summaries_for_user(user.id, start_date, end_date).values("date", "total_duration").order_by("date")
                chart = [
                    {
                        "date": row["date"].isoformat(),
                        "hours": round((row["total_duration"].total_seconds() / 3600.0), 2)
                        if isinstance(row["total_duration"], timedelta)
                        else 0.0,
                    }
                    for row in daily_rows
                ]

                total_hours = sum(entry["hours"] for entry in chart)
                week_start = today - timedelta(days=today.weekday())
                today_hours = next((entry["hours"] for entry in chart if entry["date"] == today.isoformat()), 0.0)
                week_hours = sum(entry["hours"] for entry in chart if week_start.isoformat() <= entry["date"] <= today.isoformat())

                data = {
                    "chart": chart,
                    "totals": {"today": f"{today_hours:.2f}", "week": f"{week_hours:.2f}", "month": f"{total_hours:.2f}"},
                    "assigned_tasks": [],
                    "threshold_notifications": [],
                }
                cache.set(cache_key, data, timeout=300)
            return data

        # Avoid per-request thread fan-out, which can overwhelm DB pools.
        clock_data = get_clock_data()
        tasks_data = get_tasks_data()
        summary_data = get_summary_data()

        if summary_data:
            summary_data["assigned_tasks"] = tasks_data

        return Response(
            {
                "active_session": clock_data["active_session"],
                "recent_sessions": clock_data["recent_sessions"],
                "assigned_tasks": tasks_data,
                "summary": summary_data,
                "meta": {"generated_at": timezone.now().isoformat()},
            }
        )
