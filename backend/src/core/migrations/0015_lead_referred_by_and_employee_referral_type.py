# Generated for Employee Referral lead type feature

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_ticket'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='lead',
            name='lead_type',
            field=models.CharField(
                choices=[
                    ('ad', 'Advertisement'),
                    ('social_media', 'Social Media'),
                    ('personal_reference', 'Personal Reference'),
                    ('employee_referral', 'Employee Referral'),
                    ('cold_outreach', 'Cold Outreach'),
                    ('event', 'Event / Conference'),
                    ('inbound', 'Inbound Inquiry'),
                    ('other', 'Other'),
                ],
                default='other',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='lead',
            name='referred_by',
            field=models.ForeignKey(
                blank=True,
                help_text="Set when lead_type='employee_referral' — the employee who referred this lead.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='referred_leads',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
