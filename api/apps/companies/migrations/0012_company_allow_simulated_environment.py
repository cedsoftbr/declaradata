from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('companies', '0011_remove_tp_emit_tp_company'),
    ]

    operations = [
        migrations.AddField(
            model_name='company',
            name='allow_simulated_environment_for_emitters',
            field=models.BooleanField(
                default=True,
                help_text=(
                    'Quando ativo, emitentes podem usar o ambiente Simulado sem certificado. '
                    'Desative para exigir certificado em todos os ambientes.'
                ),
                verbose_name='permitir ambiente simulado para emitentes',
            ),
        ),
    ]
