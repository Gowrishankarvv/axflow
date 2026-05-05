from __future__ import annotations

from django.db.models import QuerySet

from core.models import OrganizationUnit


def organization_unit_qs() -> QuerySet[OrganizationUnit]:
    return OrganizationUnit.objects.all()


def get_org_unit_by_id(unit_id: int) -> OrganizationUnit | None:
    return organization_unit_qs().filter(id=unit_id).first()
