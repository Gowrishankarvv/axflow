from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_alter_notification_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='salarypayment',
            name='gross_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='salarypayment',
            name='salary_cut',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=14),
        ),
        migrations.AddField(
            model_name='salarypayment',
            name='salary_cut_days',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
