from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('persons', '0009_restore_personaddress_state_registration_if_missing'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='personaddress',
            name='state_registration',
        ),
    ]
