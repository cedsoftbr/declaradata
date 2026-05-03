from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0015_add_series_active_constraint_and_shipment_index'),
    ]

    operations = [
        migrations.AlterField(
            model_name='shipment',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Rascunho'),
                    ('processing', 'Processando'),
                    ('authorized', 'Autorizado'),
                    ('cancelling', 'Cancelando'),
                    ('cancelled', 'Cancelado'),
                    ('rejected', 'Rejeitado'),
                ],
                default='draft',
                max_length=20,
                verbose_name='status',
            ),
        ),
    ]
