from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('persons', '0004_rename_persons_pers_person_i_e2a05d_idx_persons_per_person__766cb9_idx_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='personaddress',
            name='municipal_registration',
        ),
    ]
