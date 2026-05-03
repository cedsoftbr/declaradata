from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0010_company_limits'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='company',
            name='tp_emit',
        ),
        migrations.RemoveField(
            model_name='company',
            name='tp_company',
        ),
    ]
