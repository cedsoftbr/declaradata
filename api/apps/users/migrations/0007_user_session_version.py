from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0006_user_allowed_emitentes'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        'ALTER TABLE users_user '
                        'ADD COLUMN IF NOT EXISTS session_version integer '
                        'NOT NULL DEFAULT 1;'
                    ),
                    reverse_sql=(
                        'ALTER TABLE users_user '
                        'DROP COLUMN IF EXISTS session_version;'
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='user',
                    name='session_version',
                    field=models.PositiveIntegerField(
                        default=1,
                        verbose_name='versão da sessão',
                    ),
                ),
            ],
        ),
    ]
