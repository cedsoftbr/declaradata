from django.db import migrations, models


def _set_profile_from_legacy_flags(apps, _schema_editor):
    User = apps.get_model('users', 'User')

    superadmin_qs = User.objects.filter(is_superuser=True) | User.objects.filter(
        is_staff=True
    )
    superadmin_qs.update(profile='superadmin', can_manage_users=True)

    User.objects.filter(
        is_superuser=False, is_staff=False, can_manage_users=True
    ).update(profile='admin')

    User.objects.filter(
        is_superuser=False, is_staff=False, can_manage_users=False
    ).update(profile='emissor')


def _restore_legacy_flags_from_profile(apps, _schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(profile='superadmin').update(can_manage_users=True, is_staff=True)
    User.objects.filter(profile='admin').update(can_manage_users=True)
    User.objects.filter(profile='emissor').update(can_manage_users=False)


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0003_userconsentaudit'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='profile',
            field=models.CharField(
                choices=[
                    ('superadmin', 'Superadmin'),
                    ('admin', 'Admin'),
                    ('emissor', 'Emissor'),
                ],
                db_index=True,
                default='emissor',
                max_length=20,
                verbose_name='perfil',
            ),
        ),
        migrations.RunPython(
            _set_profile_from_legacy_flags,
            _restore_legacy_flags_from_profile,
        ),
    ]
