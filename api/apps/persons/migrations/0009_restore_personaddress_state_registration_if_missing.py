from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('persons', '0008_person_preferred_series'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                'ALTER TABLE persons_personaddress '
                'ADD COLUMN IF NOT EXISTS state_registration varchar(20) '
                'NOT NULL DEFAULT \'\';'
            ),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
