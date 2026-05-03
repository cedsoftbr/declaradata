import uuid
from typing import ClassVar

from django.db import models


class PersonAuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'create', 'Criação'
        UPDATE = 'update', 'Alteração'
        DELETE = 'delete', 'Exclusão'
        CERT_UPLOAD = 'cert_upload', 'Upload de certificado'
        CERT_DELETE = 'cert_delete', 'Remoção de certificado'
        IMPORT = 'import', 'Importação'

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='person_audit_logs',
        verbose_name='empresa',
    )
    actor = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='person_audit_logs',
        verbose_name='responsável',
    )
    actor_email = models.CharField(max_length=254, verbose_name='e-mail do responsável')
    action = models.CharField(
        max_length=20, choices=Action.choices, verbose_name='ação'
    )
    person = models.ForeignKey(
        'persons.Person',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        verbose_name='pessoa',
    )
    person_document = models.CharField(max_length=18, verbose_name='documento')
    changed_fields = models.JSONField(default=dict, verbose_name='campos alterados')
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name='IP')
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name='data/hora')

    class Meta:
        verbose_name = 'log de auditoria de pessoa'
        verbose_name_plural = 'logs de auditoria de pessoas'
        ordering: ClassVar[list] = ['-timestamp']
        indexes: ClassVar[list] = [
            models.Index(fields=['company', 'timestamp']),
            models.Index(fields=['person', 'timestamp']),
        ]
