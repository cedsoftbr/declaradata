import uuid

from django.db import models

from apps.locations.models import City


class Company(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    # Identificação
    name = models.CharField(max_length=255, verbose_name='razão social')
    trade_name = models.CharField(
        max_length=255, blank=True, verbose_name='nome fantasia'
    )
    cnpj = models.CharField(max_length=18, unique=True)

    # Contato
    contact_name = models.CharField(
        max_length=255, blank=True, verbose_name='nome do contato'
    )
    contact_phone = models.CharField(max_length=20, blank=True, verbose_name='telefone')
    contact_email = models.EmailField(blank=True, verbose_name='e-mail de contato')

    # Endereço
    zip_code = models.CharField(max_length=9, blank=True, verbose_name='CEP')
    address = models.CharField(max_length=255, blank=True, verbose_name='endereço')
    number = models.CharField(max_length=10, blank=True, verbose_name='número')
    complement = models.CharField(
        max_length=100, blank=True, verbose_name='complemento'
    )
    neighborhood = models.CharField(max_length=100, blank=True, verbose_name='bairro')
    city = models.ForeignKey(
        City,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='companies',
        verbose_name='cidade',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Ambient(models.IntegerChoices):
        PRODUCAO = 1, 'Produção'
        HOMOLOGACAO = 2, 'Homologação'
        SIMULADO = 3, 'Simulado'

    environment = models.PositiveSmallIntegerField(
        default=Ambient.HOMOLOGACAO,
        choices=Ambient.choices,
        verbose_name='ambiente (SEFAZ)',
        help_text='Define o ambiente para integração com a SEFAZ real.',
    )

    current_ambient = models.PositiveSmallIntegerField(
        default=Ambient.SIMULADO,
        choices=Ambient.choices,
        verbose_name='ambiente atual',
        help_text='Define o ambiente padrão para novas remessas.',
    )

    # ── Integração SEFAZ DCe ─────────────────────────────────────────────────
    use_sefaz_integration = models.BooleanField(
        default=False,
        verbose_name='usar integração SEFAZ real',
        help_text='Feature flag para habilitar envio real à SEFAZ por empresa.',
    )
    plan = models.ForeignKey(
        'billing.Plan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='companies',
        verbose_name='plano',
    )
    last_nsu_prod = models.CharField(
        max_length=15,
        default='000000000000000',
        verbose_name='último NSU produção',
    )
    last_nsu_homolog = models.CharField(
        max_length=15,
        default='000000000000000',
        verbose_name='último NSU homologação',
    )

    allow_simulated_environment_for_emitters = models.BooleanField(
        default=True,
        verbose_name='permitir ambiente simulado para emitentes',
        help_text=(
            'Quando ativo, emitentes podem usar o ambiente Simulado sem certificado. '
            'Desative para exigir certificado em todos os ambientes.'
        ),
    )

    class Meta:
        verbose_name = 'empresa'
        verbose_name_plural = 'empresas'

    def __str__(self):
        return self.name

    @property
    def monthly_dce_limit(self) -> int:
        return self.plan.monthly_dce_limit if self.plan_id else 100

    @property
    def active_user_limit(self) -> int:
        return self.plan.active_user_limit if self.plan_id else 5
