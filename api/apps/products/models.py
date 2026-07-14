import uuid
from typing import ClassVar

from django.db import models


class NcmCatalog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    ncm = models.CharField(max_length=8, unique=True, verbose_name='NCM')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'NCM catalogado'
        verbose_name_plural = 'NCMs catalogados'
        ordering: ClassVar[list[str]] = ['ncm']

    def __str__(self):
        return self.ncm


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='products',
        verbose_name='empresa',
    )
    descricao = models.CharField(max_length=255, verbose_name='descrição')
    ncm = models.CharField(max_length=8, verbose_name='NCM')
    unit_value = models.DecimalField(
        max_digits=11,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name='valor unitário',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'produto'
        verbose_name_plural = 'produtos'
        ordering: ClassVar[list[str]] = ['descricao']
        unique_together = ('company', 'ncm', 'descricao')

    def __str__(self):
        return f'{self.descricao} ({self.ncm})'
