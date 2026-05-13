from rest_framework.permissions import BasePermission, SAFE_METHODS


# Position values that count as "executive" — must mirror the <optgroup label="Executive">
# entries in frontend/src/pages/Admin.tsx so the dropdown and the gate stay in sync.
EXECUTIVE_POSITIONS = {"CEO", "CFO", "COO", "CMO", "Executive"}


def is_executive(user) -> bool:
    """Superusers always pass. Otherwise, position must be in EXECUTIVE_POSITIONS."""
    if not (user and getattr(user, "is_authenticated", False)):
        return False
    if user.is_superuser or getattr(user, "role", "") == "superuser":
        return True
    return getattr(user, "position", "") in EXECUTIVE_POSITIONS


class IsExecutive(BasePermission):
    """Gate for the Finance module and any other executive-only API."""
    def has_permission(self, request, view):
        return is_executive(request.user)


class IsSuperuser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, 'role', '') == 'superuser'))

class IsManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (getattr(user, 'role', '') in ('manager', 'superuser') or user.is_superuser))

class IsClientUser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'role', '') == 'client')

class IsSelfOrManagerOrSuperuser(BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or getattr(user, 'role', '') == 'superuser':
            return True
        if hasattr(obj, 'id') and obj.id == user.id:
            return True
        # if obj has manager chain include user
        current = getattr(obj, 'manager', None)
        while current is not None:
            if current.id == user.id:
                return True
            current = getattr(current, 'manager', None)
        return False
