import uuid
from typing import ClassVar

from django.db import models


class Plan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    name = models.CharField(max_length=100, unique=True, verbose_name='nome')
    monthly_dce_limit = models.PositiveIntegerField(
        verbose_name='limite mensal de DC-e'
    )
    active_user_limit = models.PositiveIntegerField(
        verbose_name='limite de usuários ativos'
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='preço mensal (R$)',
    )
    is_active = models.BooleanField(default=True, verbose_name='ativo')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'plano'
        verbose_name_plural = 'planos'
        ordering: ClassVar[list] = ['name']

    def __str__(self):
        return self.name


class Invoice(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pendente'
        PAID = 'paid', 'Pago'
        OVERDUE = 'overdue', 'Vencido'
        CANCELLED = 'cancelled', 'Cancelado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name='empresa',
    )
    plan_name = models.CharField(max_length=100, verbose_name='plano (snapshot)')
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='valor (R$)',
    )
    year = models.PositiveSmallIntegerField(verbose_name='ano')
    month = models.PositiveSmallIntegerField(verbose_name='mês')
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='status',
    )
    due_date = models.DateField(verbose_name='vencimento')
    paid_at = models.DateTimeField(null=True, blank=True, verbose_name='pago em')
    notes = models.TextField(blank=True, verbose_name='observações')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'fatura'
        verbose_name_plural = 'faturas'
        ordering: ClassVar[list] = ['-year', '-month', 'company__name']
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=['company', 'year', 'month'],
                name='unique_invoice_per_company_per_month',
            )
        ]

    def __str__(self):
        return f'{self.company} — {self.month:02d}/{self.year}'
