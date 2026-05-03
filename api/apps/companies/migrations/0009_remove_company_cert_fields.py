from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0008_remove_company_municipal_registration'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='company',
            name='cert_pfx',
        ),
        migrations.RemoveField(
            model_name='company',
            name='cert_password',
        ),
        migrations.RemoveField(
            model_name='company',
            name='cert_expires_at',
        ),
        migrations.RemoveField(
            model_name='company',
            name='cert_uploaded_at',
        ),
    ]
