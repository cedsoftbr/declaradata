import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('persons', '0006_person_is_emitente_personcertificate'),
        ('shipments', '0012_remove_shipment_unique_shipment_number_per_company_and_more'),
    ]

    operations = [
        # 1. Add emitter FK to Series (nullable)
        migrations.AddField(
            model_name='series',
            name='emitter',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='series',
                to='persons.person',
                verbose_name='emitente',
            ),
        ),
        # 2. Drop old unique_together on Series
        migrations.AlterUniqueTogether(
            name='series',
            unique_together=set(),
        ),
        # 3. Add new unique_together on Series using emitter
        migrations.AlterUniqueTogether(
            name='series',
            unique_together={('emitter', 'ambient', 'code')},
        ),
        # 4. Add emitter FK to Shipment (nullable)
        migrations.AddField(
            model_name='shipment',
            name='emitter',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='shipments_as_emitter',
                to='persons.person',
                verbose_name='emitente',
            ),
        ),
        # 5. Drop old UniqueConstraint on Shipment
        migrations.RemoveConstraint(
            model_name='shipment',
            name='unique_shipment_number_per_ambient_and_serie',
        ),
        # 6. Add new UniqueConstraint on Shipment using emitter
        migrations.AddConstraint(
            model_name='shipment',
            constraint=models.UniqueConstraint(
                condition=models.Q(number__isnull=False),
                fields=['emitter', 'tp_amb', 'serie', 'number'],
                name='unique_shipment_number_per_ambient_and_serie',
            ),
        ),
    ]
