from __future__ import annotations

from django.db import migrations, models


def populate_project_start_date(apps, schema_editor):
    Project = apps.get_model("core", "Project")
    # For all existing projects that don't have start_date set, default to created_at
    Project.objects.filter(start_date__isnull=True).update(start_date=models.F("created_at"))


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_squashed_0029_client_logo"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="start_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="project",
            name="end_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="task",
            name="actual_start_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="task",
            name="planned_start_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="task",
            name="planned_end_date",
            field=models.DateField(null=True, blank=True),
        ),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                max_length=20,
                choices=[
                    ("todo", "To Do"),
                    ("pending", "Pending"),
                    ("in_progress", "In Progress"),
                    ("done", "Done"),
                ],
                default="todo",
            ),
        ),
        migrations.RunPython(populate_project_start_date, migrations.RunPython.noop),
    ]

