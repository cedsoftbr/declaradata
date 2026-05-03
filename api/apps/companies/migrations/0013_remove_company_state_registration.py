from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('companies', '0012_company_allow_simulated_environment'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='company',
            name='state_registration',
        ),
    ]
