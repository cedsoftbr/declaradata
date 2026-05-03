from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0014_alter_shipment_tp_emit'),
    ]

    operations = [
        # Garante no máximo 1 série ativa por emitente+ambiente
        migrations.AddConstraint(
            model_name='series',
            constraint=models.UniqueConstraint(
                fields=['emitter', 'ambient'],
                condition=models.Q(is_active=True),
                name='unique_active_series_per_emitter_ambient',
            ),
        ),
        # Índice para busca eficiente do maior número emitido por série
        migrations.AddIndex(
            model_name='shipment',
            index=models.Index(
                fields=['emitter', 'tp_amb', 'serie', 'number'],
                name='shp_emit_amb_serie_num_idx',
            ),
        ),
    ]
