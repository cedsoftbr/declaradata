import uuid
from typing import ClassVar

from django.db import models

from apps.locations.models import City


class Person(models.Model):
    """Pessoa jurídica (CNPJ) ou física (CPF) vinculada a uma empresa."""

    CNPJ_LENGTH = 14

    class EmitType(models.IntegerChoices):
        MARKETPLACE = 1, 'Marketplace'
        PROPRIO = 2, 'Emissor Próprio'
        TRANSPORTADORA = 3, 'Transportadora'

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name='persons',
        verbose_name='empresa',
    )

    # Identificação
    name = models.CharField(max_length=255, verbose_name='razão social / nome')
    document = models.CharField(max_length=18, verbose_name='CPF / CNPJ')

    is_carrier = models.BooleanField(default=False, verbose_name='é transportadora')
    is_emitente = models.BooleanField(default=False, verbose_name='é emitente DCe')
    tp_emit = models.PositiveSmallIntegerField(
        choices=EmitType.choices,
        default=EmitType.PROPRIO,
        verbose_name='tipo de emitente',
    )
    preferred_series = models.PositiveSmallIntegerField(
        default=1,
        verbose_name='série preferencial',
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'pessoa'
        verbose_name_plural = 'pessoas'
        ordering: ClassVar[list[str]] = ['name']
        unique_together = ('company', 'document')
        indexes: ClassVar[list] = [
            models.Index(fields=['company', 'is_active']),
        ]

    @property
    def person_type(self) -> str:
        digits = ''.join(filter(str.isdigit, self.document))
        return 'juridica' if len(digits) == self.CNPJ_LENGTH else 'fisica'

    @property
    def person_type_display(self) -> str:
        return 'Pessoa Jurídica' if self.person_type == 'juridica' else 'Pessoa Física'

    def __str__(self):
        return f'{self.name} ({self.person_type_display})'


class PersonAddress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='addresses',
        verbose_name='pessoa',
    )

    label = models.CharField(max_length=100, blank=True, verbose_name='rótulo')
    contact_phone = models.CharField(max_length=20, blank=True, verbose_name='telefone')
    contact_email = models.EmailField(blank=True, verbose_name='e-mail')

    zip_code = models.CharField(max_length=9, verbose_name='CEP')
    address = models.CharField(max_length=255, verbose_name='endereço')
    number = models.CharField(max_length=10, verbose_name='número')
    complement = models.CharField(
        max_length=100, blank=True, verbose_name='complemento'
    )
    neighborhood = models.CharField(max_length=100, verbose_name='bairro')
    city = models.ForeignKey(
        City,
        on_delete=models.PROTECT,
        related_name='person_addresses',
        verbose_name='cidade',
    )

    is_default = models.BooleanField(default=False, verbose_name='endereço padrão')
    is_active = models.BooleanField(default=True, verbose_name='ativo')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'endereço da pessoa'
        verbose_name_plural = 'endereços da pessoa'
        ordering: ClassVar[list[str]] = ['-is_default', 'label', '-created_at']
        indexes: ClassVar[list] = [
            models.Index(fields=['person', 'is_active']),
            models.Index(fields=['person', 'is_default']),
        ]

    def __str__(self):
        suffix = f' - {self.label}' if self.label else ''
        return f'{self.person.name}{suffix}'


class PersonCertificate(models.Model):
    """Certificado digital A1 vinculado à pessoa emitente de DCe."""

    class Ambient(models.IntegerChoices):
        PRODUCAO = 1, 'Produção'
        HOMOLOGACAO = 2, 'Homologação'

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    person = models.OneToOneField(
        Person,
        on_delete=models.CASCADE,
        related_name='certificate',
        verbose_name='pessoa',
    )
    environment = models.PositiveSmallIntegerField(
        default=Ambient.HOMOLOGACAO,
        choices=Ambient.choices,
        verbose_name='ambiente',
    )

    # Conteúdo do .pfx criptografado com Fernet (CERTIFICATE_ENCRYPTION_KEY).
    cert_pfx = models.BinaryField(
        null=True,
        blank=True,
        verbose_name='certificado A1 (cifrado)',
        help_text='Conteúdo do .pfx criptografado. Nunca retornado via API.',
    )
    cert_password = models.CharField(
        max_length=512,
        blank=True,
        verbose_name='senha do certificado (cifrada)',
    )
    cert_expires_at = models.DateField(
        null=True,
        blank=True,
        verbose_name='validade do certificado',
    )
    cert_uploaded_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='enviado em',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'certificado da pessoa'
        verbose_name_plural = 'certificados das pessoas'

    def __str__(self):
        return f'Certificado de {self.person.name}'
