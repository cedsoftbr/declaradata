from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('companies', '0007_company_tp_company'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='company',
            name='municipal_registration',
        ),
    ]
