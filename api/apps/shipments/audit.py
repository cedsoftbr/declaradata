import uuid
from typing import ClassVar

from django.db import models


class ShipmentExportLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shipment_export_logs',
        verbose_name='empresa',
    )
    actor = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='shipment_export_logs',
        verbose_name='responsável',
    )
    actor_email = models.CharField(max_length=254, verbose_name='e-mail do responsável')
    export_type = models.CharField(
        max_length=20, default='xlsx', verbose_name='tipo de exportação'
    )
    shipment_count = models.PositiveIntegerField(
        default=0, verbose_name='qtd. remessas'
    )
    filters_applied = models.JSONField(default=dict, verbose_name='filtros aplicados')
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name='IP')
    task_id = models.CharField(max_length=50, blank=True, verbose_name='task ID')
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name='data/hora')

    class Meta:
        verbose_name = 'log de exportação de remessas'
        verbose_name_plural = 'logs de exportação de remessas'
        ordering: ClassVar[list] = ['-timestamp']
        indexes: ClassVar[list] = [
            models.Index(fields=['company', 'timestamp']),
        ]
