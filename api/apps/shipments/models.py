import random
import string
import uuid
from typing import ClassVar

from django.db import models, transaction
from django_fsm import FSMField, transition


class Series(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='shipment_series',
        verbose_name='empresa',
    )
    emitter = models.ForeignKey(
        'persons.Person',
        on_delete=models.CASCADE,
        related_name='series',
        verbose_name='emitente',
        null=True,
        blank=True,
    )

    class Ambient(models.IntegerChoices):
        PRODUCAO = 1, 'Produção'
        HOMOLOGACAO = 2, 'Homologação'
        SIMULADO = 3, 'Simulado'

    ambient = models.PositiveSmallIntegerField(
        choices=Ambient.choices,
        verbose_name='ambiente',
    )
    code = models.PositiveSmallIntegerField(verbose_name='série')
    last_number = models.PositiveIntegerField(default=0, verbose_name='último número')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'série'
        verbose_name_plural = 'séries'
        unique_together = ('emitter', 'ambient', 'code')
        ordering: ClassVar[list] = ['ambient', 'code']
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=['emitter', 'ambient'],
                condition=models.Q(is_active=True),
                name='unique_active_series_per_emitter_ambient',
            ),
        ]

    def __str__(self):
        return f'Série {self.code} ({self.get_ambient_display()})'


class Shipment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Rascunho'
        PROCESSING = 'processing', 'Processando'
        AUTHORIZED = 'authorized', 'Autorizado'
        CANCELLING = 'cancelling', 'Cancelando'
        CANCELLED = 'cancelled', 'Cancelado'
        REJECTED = 'rejected', 'Rejeitado'

    class TransportMode(models.IntegerChoices):
        RODOVIARIO = 1, 'Rodoviário'
        AEREO = 2, 'Aéreo'
        AQUAVIARIO = 3, 'Aquaviário'
        FERROVIARIO = 4, 'Ferroviário'
        POSTAL = 5, 'Postal'

    class Ambient(models.IntegerChoices):
        PRODUCAO = 1, 'Produção'
        HOMOLOGACAO = 2, 'Homologação'
        SIMULADO = 3, 'Simulado'

    class EmitType(models.IntegerChoices):
        MARKETPLACE = 1, 'Marketplace'
        PROPRIO = 2, 'Emissor Próprio'
        TRANSPORTADORA = 3, 'Transportadora'

    class TpTransp(models.IntegerChoices):
        CORREIOS = 0, 'Correios'
        PROPRIO = 1, 'Próprio'
        TERCEIRIZADO = 2, 'Terceirizado'

    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='shipments',
        verbose_name='empresa',
    )
    emitter = models.ForeignKey(
        'persons.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_emitter',
        verbose_name='emitente',
    )
    sender = models.ForeignKey(
        'persons.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_sender',
        verbose_name='remetente',
    )
    recipient = models.ForeignKey(
        'persons.Person',
        on_delete=models.PROTECT,
        related_name='shipments_as_recipient',
        verbose_name='destinatário',
    )
    carrier = models.ForeignKey(
        'persons.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_carrier',
        verbose_name='transportador',
    )
    sender_address = models.ForeignKey(
        'persons.PersonAddress',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_sender_addr',
        verbose_name='endereço remetente',
    )
    recipient_address = models.ForeignKey(
        'persons.PersonAddress',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_recipient_addr',
        verbose_name='endereço destinatário',
    )
    carrier_address = models.ForeignKey(
        'persons.PersonAddress',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments_as_carrier_addr',
        verbose_name='endereço transportador',
    )

    # Dados fiscais básicos
    status = FSMField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='status',
    )

    series = models.ForeignKey(
        Series,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='shipments',
        verbose_name='série',
    )
    # serie e number mantidos como denormalização para compatibilidade e histórico
    serie = models.PositiveSmallIntegerField(default=0, verbose_name='série')
    number = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='número DCe',
        help_text='Atribuído atomicamente no momento da geração do XML.',
    )

    c_dc = models.CharField(
        max_length=8,
        blank=True,
        verbose_name='código aleatório',
        help_text='Gerado junto com o número no momento da emissão.',
    )

    c_dv = models.PositiveSmallIntegerField(
        blank=True, null=True, verbose_name='dígito verificador'
    )
    tp_emis = models.PositiveSmallIntegerField(
        default=1, verbose_name='tipo de emissão'
    )
    tp_emit = models.PositiveSmallIntegerField(
        choices=EmitType.choices,
        default=EmitType.PROPRIO,
        verbose_name='tipo de emitente',
    )
    tp_amb = models.PositiveSmallIntegerField(
        choices=Ambient.choices, default=Ambient.SIMULADO, verbose_name='ambiente'
    )
    transport_mode = models.PositiveSmallIntegerField(
        choices=TransportMode.choices, verbose_name='modal de transporte'
    )
    tp_transp = models.PositiveSmallIntegerField(
        choices=TpTransp.choices,
        default=TpTransp.TERCEIRIZADO,
        verbose_name='tipo de transporte',
    )

    # Chave de Acesso e Protocolo (Sefaz)
    access_key = models.CharField(
        max_length=44, blank=True, verbose_name='chave de acesso'
    )
    protocol = models.CharField(max_length=20, blank=True, verbose_name='protocolo')

    # Informações Adicionais
    info_complementar = models.TextField(
        blank=True, verbose_name='informações complementares'
    )
    info_fisco = models.TextField(blank=True, verbose_name='informações do fisco')

    # Autorização SEFAZ
    n_prot = models.CharField(
        max_length=20, blank=True, verbose_name='número do protocolo SEFAZ'
    )
    dh_recbto = models.DateTimeField(
        null=True, blank=True, verbose_name='data/hora de autorização SEFAZ'
    )
    # Cancelamento SEFAZ
    n_prot_cancel = models.CharField(
        max_length=20, blank=True, verbose_name='protocolo de cancelamento'
    )
    dh_cancel = models.DateTimeField(
        null=True, blank=True, verbose_name='data/hora do cancelamento SEFAZ'
    )

    # URLs e XML
    qr_code_url = models.TextField(blank=True, verbose_name='URL QR Code')
    url_chave = models.TextField(blank=True, verbose_name='URL chave')
    xml_signed = models.TextField(blank=True, verbose_name='XML assinado')  # Deprecated
    xml_key = models.CharField(
        max_length=255, blank=True, verbose_name='Chave XML no R2'
    )
    pdf_key = models.CharField(
        max_length=255, blank=True, verbose_name='Chave PDF no R2'
    )
    cancel_xml_key = models.CharField(
        max_length=255, blank=True, verbose_name='Chave XML de cancelamento no R2'
    )

    # Datas e Snapshots
    dh_emi = models.DateTimeField(
        blank=True, null=True, verbose_name='data/hora de emissão'
    )
    participants_snapshot = models.JSONField(
        blank=True,
        null=True,
        verbose_name='snapshot dos participantes',
        help_text=(
            'Chaves: emit, sender, recipient, carrier, marketplace. '
            'Captura o estado dos participantes no momento da emissão.'
        ),
    )

    # ── Propriedades de acesso ao snapshot (backward compat) ──────────────────
    # Permitem que xml_builder.py e pdf_generator.py acessem
    # shipment.emit_snapshot, shipment.sender_snapshot etc. sem alterações.

    @property
    def emit_snapshot(self):
        return (self.participants_snapshot or {}).get('emit')

    @property
    def sender_snapshot(self):
        return (self.participants_snapshot or {}).get('sender')

    @property
    def recipient_snapshot(self):
        return (self.participants_snapshot or {}).get('recipient')

    @property
    def carrier_snapshot(self):
        return (self.participants_snapshot or {}).get('carrier')

    @property
    def marketplace_snapshot(self):
        return (self.participants_snapshot or {}).get('marketplace')

    last_emission_error = models.TextField(
        blank=True,
        verbose_name='último erro de emissão',
        help_text='Preenchido automaticamente quando a emissão falha.',
    )

    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shipments_created',
        verbose_name='criado por',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'remessa'
        verbose_name_plural = 'remessas'
        ordering: ClassVar[list] = ['-created_at']
        indexes: ClassVar[list] = [
            models.Index(fields=['company', 'created_at']),
            models.Index(fields=['status', 'company']),
            models.Index(fields=['access_key']),
            models.Index(fields=['n_prot']),
            models.Index(
                fields=['emitter', 'tp_amb', 'serie', 'number'],
                name='shp_emit_amb_serie_num_idx',
            ),
        ]
        constraints: ClassVar[list] = [
            # Unicidade por emitente, ambiente e série
            models.UniqueConstraint(
                fields=['emitter', 'tp_amb', 'serie', 'number'],
                condition=models.Q(number__isnull=False),
                name='unique_shipment_number_per_ambient_and_serie',
            ),
        ]

    # ── Transições de status ───────────────────────────────────────────────────

    @transition(
        field=status, source=[Status.DRAFT, Status.REJECTED], target=Status.PROCESSING
    )
    def start_processing(self):
        """Inicia o processamento assíncrono da remessa."""

    @transition(
        field=status,
        source=[Status.DRAFT, Status.PROCESSING],
        target=Status.AUTHORIZED,
    )
    def authorize(self):
        """Marca a remessa como autorizada após emissão bem-sucedida."""
        self.last_emission_error = ''

    @transition(field=status, source=Status.PROCESSING, target=Status.DRAFT)
    def revert_to_draft(self, error: str = ''):
        """Reverte para rascunho em caso de falha transitória."""
        self.last_emission_error = error

    @transition(
        field=status,
        source=[Status.PROCESSING, Status.REJECTED],
        target=Status.REJECTED,
    )
    def reject(self, error: str = ''):
        """Marca a remessa como rejeitada pela SEFAZ (erro permanente)."""
        self.last_emission_error = error

    @transition(field=status, source=Status.REJECTED, target=Status.DRAFT)
    def reset_rejected(self):
        """Reseta para rascunho ao editar um DCe rejeitado."""
        self.last_emission_error = ''

    @transition(field=status, source=Status.AUTHORIZED, target=Status.CANCELLING)
    def start_cancel(self):
        """Marca a remessa como em processo de cancelamento."""

    @transition(field=status, source=Status.CANCELLING, target=Status.CANCELLED)
    def cancel(self):
        """Finaliza o cancelamento da remessa."""

    @transition(field=status, source=Status.CANCELLING, target=Status.AUTHORIZED)
    def revert_cancel(self):
        """Reverte para autorizado quando o cancelamento falha."""

    def __str__(self):
        num = f'{self.number:09d}' if self.number is not None else 'S/N'
        return f'DCe {num} ({self.get_status_display()})'

    @classmethod
    def assign_number(cls, shipment):
        """
        Atribui atomicamente o próximo número sequencial e o código aleatório
        à remessa. Persiste number e c_dc no banco imediatamente.
        """
        if shipment.number is not None:
            return

        with transaction.atomic():
            if not shipment.series:
                # Fallback: cria série para o emitente + ambiente + código
                series, _ = Series.objects.get_or_create(
                    company=shipment.company,
                    emitter=shipment.emitter,
                    ambient=shipment.tp_amb,
                    code=shipment.serie,
                    defaults={'last_number': 0},
                )
                shipment.series = series

            # Lock na série para garantir sequência única
            series = Series.objects.select_for_update().get(pk=shipment.series_id)
            series.last_number += 1
            series.save(update_fields=['last_number', 'updated_at'])

            shipment.number = series.last_number
            shipment.serie = series.code
            shipment.c_dc = cls.generate_c_dc()

            cls.objects.filter(pk=shipment.pk).update(
                series=shipment.series,
                number=shipment.number,
                serie=shipment.serie,
                c_dc=shipment.c_dc,
            )

    @staticmethod
    def generate_c_dc():
        """Gera código aleatório de 6 dígitos para compor a chave de acesso."""
        return ''.join(random.choices(string.digits, k=6))


class ShipmentItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    shipment = models.ForeignKey(
        Shipment,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='remessa',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shipment_items',
        verbose_name='produto',
    )
    n_item = models.PositiveSmallIntegerField(verbose_name='nº do item')
    x_prod = models.CharField(max_length=120, verbose_name='descrição do produto')
    ncm = models.CharField(max_length=8, verbose_name='NCM')
    q_com = models.DecimalField(
        max_digits=11, decimal_places=4, verbose_name='quantidade'
    )
    v_un_com = models.DecimalField(
        max_digits=11, decimal_places=4, verbose_name='valor unitário'
    )
    v_prod = models.DecimalField(
        max_digits=11, decimal_places=2, verbose_name='valor total'
    )

    class Meta:
        verbose_name = 'item de remessa'
        verbose_name_plural = 'itens de remessa'
        unique_together = ('shipment', 'n_item')
        ordering: ClassVar[list] = ['n_item']

    def __str__(self):
        return f'{self.x_prod} (Item {self.n_item})'
