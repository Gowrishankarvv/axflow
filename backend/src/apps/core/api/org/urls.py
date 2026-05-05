from django.urls import path

from .views import OrganizationHierarchyView, OrganizationTreeView, TeamManagementView

urlpatterns = [
    path('org-tree/', OrganizationTreeView.as_view(), name='org-tree'),
    path('org-hierarchy/', OrganizationHierarchyView.as_view(), name='org-hierarchy'),
    path('team-management/', TeamManagementView.as_view(), name='team-management'),
]
