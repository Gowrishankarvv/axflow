"""Salary-cut maths shared by the Salary and Finance modules.

When a manager approves a leave they flag whether it is *salary-cut eligible*
(`LeaveRequest.is_salary_cut`). For a given calendar month the cut is:

    per_day  = monthly_salary / total_days_in_that_month
    cut      = per_day * (salary-cut leave days that fall in the month)
    net      = monthly_salary - cut

A leave can straddle a month boundary, so we intersect each leave's
[start_date, end_date] with the month window before counting days — the same
approach the leaves `month_usage`/`summary` endpoints already use.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from core.models import LeaveRequest

_CENTS = Decimal("0.01")


def salary_cut_days(employee_id: int, year: int, month: int) -> int:
    """Approved, salary-cut-flagged leave days for the employee in that month."""
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])
    leaves = LeaveRequest.objects.filter(
        user_id=employee_id,
        status="approved",
        is_salary_cut=True,
        start_date__lte=month_end,
        end_date__gte=month_start,
    )
    total = 0
    for lv in leaves:
        s = max(lv.start_date, month_start)
        e = min(lv.end_date, month_end)
        total += (e - s).days + 1
    return total


def compute_salary_cut(amount, employee_id: int, year: int, month: int) -> dict:
    """Break a monthly salary into gross / cut / net for the given period.

    Returns plain JSON-friendly values (Decimals quantised to paise, plus the
    raw day counts) so both the API responses and the ledger can use them.
    """
    gross = Decimal(str(amount))
    days_in_month = monthrange(year, month)[1]
    days = salary_cut_days(employee_id, year, month)

    per_day = (gross / Decimal(days_in_month)).quantize(_CENTS, rounding=ROUND_HALF_UP)
    cut = (per_day * days).quantize(_CENTS, rounding=ROUND_HALF_UP)
    if cut > gross:
        cut = gross
    net = gross - cut

    return {
        "year": year,
        "month": month,
        "days_in_month": days_in_month,
        "salary_cut_days": days,
        "per_day": per_day,
        "gross_amount": gross,
        "salary_cut": cut,
        "net_amount": net,
    }
