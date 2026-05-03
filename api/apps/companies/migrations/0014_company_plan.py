import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0001_initial'),
        ('companies', '0013_remove_company_state_registration'),
    ]

    operations = [
        migrations.RemoveField(model_name='company', name='monthly_dce_limit'),
        migrations.RemoveField(model_name='company', name='active_user_limit'),
        migrations.AddField(
            model_name='company',
            name='plan',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='companies',
                to='billing.plan',
                verbose_name='plano',
            ),
        ),
    ]
