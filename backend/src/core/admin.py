from django.contrib import admin
from .models import User, OrganizationUnit, Project, ProjectAssignment, TimeEntry, Task, TaskAssignment, Tag

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'position', 'monthly_threshold_hours', 'manager', 'must_set_password', 'is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    list_filter = ('role', 'is_active')

@admin.register(OrganizationUnit)
class OrgAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent')

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'created_at')
    search_fields = ('name',)

@admin.register(ProjectAssignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('project', 'assignee', 'assigned_by', 'allotted_hours', 'start_date', 'end_date')
    list_filter = ('project',)

@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ('user', 'project', 'start_datetime', 'end_datetime', 'duration', 'created_at')
    list_filter = ('project', 'user')

class TaskAssignmentInline(admin.TabularInline):
    model = TaskAssignment
    extra = 0
    fields = ('assignee', 'allotted_hours', 'start_date', 'end_date')

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'status', 'due_date', 'created_at')
    list_filter = ('status', 'project')
    search_fields = ('title',)
    inlines = [TaskAssignmentInline]

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('emoji', 'name', 'category', 'is_active', 'created_at')
    list_filter = ('category', 'is_active')
    search_fields = ('name',)
    ordering = ('category', 'name')

@admin.register(TaskAssignment)
class TaskAssignmentAdmin(admin.ModelAdmin):
    list_display = ('task', 'assignee', 'assigned_by', 'allotted_hours', 'start_date', 'end_date')
    list_filter = ('task',)
