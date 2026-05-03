from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('persons', '0006_person_is_emitente_personcertificate'),
        ('users', '0005_alter_user_profile'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='allowed_emitentes',
            field=models.ManyToManyField(
                blank=True,
                related_name='allowed_users',
                to='persons.person',
                verbose_name='emitentes permitidos',
            ),
        ),
    ]
