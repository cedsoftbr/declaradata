from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0009_remove_company_cert_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='active_user_limit',
            field=models.PositiveIntegerField(
                default=5,
                help_text='Quantidade máxima de usuários ativos (admin e emissor).',
                verbose_name='limite de usuários ativos',
            ),
        ),
        migrations.AddField(
            model_name='company',
            name='monthly_dce_limit',
            field=models.PositiveIntegerField(
                default=100,
                help_text='Quantidade máxima mensal de DC-e para a empresa.',
                verbose_name='limite mensal de DC-e',
            ),
        ),
    ]
