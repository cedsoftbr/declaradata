from typing import ClassVar

from cryptography.hazmat.primitives.serialization import pkcs12
from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from validate_docbr import CNPJ, CPF

from apps.locations.serializers import CitySerializer

from .audit import PersonAuditLog
from .models import Person, PersonAddress, PersonCertificate

_cpf = CPF()
_cnpj = CNPJ()


def validate_cpf_cnpj(document: str) -> str:
    """Valida CPF (11 dígitos) ou CNPJ (14 dígitos) com verificação de dígito."""
    digits = ''.join(filter(str.isdigit, document))
    if len(digits) == 11:  # noqa: PLR2004
        if not _cpf.validate(digits):
            raise serializers.ValidationError('CPF inválido.')
    elif len(digits) == 14:  # noqa: PLR2004
        if not _cnpj.validate(digits):
            raise serializers.ValidationError('CNPJ inválido.')
    else:
        raise serializers.ValidationError(
            'Documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'
        )
    return document


class PersonAddressSerializer(serializers.ModelSerializer):
    city = CitySerializer(read_only=True)
    city_name = serializers.SerializerMethodField()
    city_uf = serializers.SerializerMethodField()
    city_id = serializers.PrimaryKeyRelatedField(
        source='city',
        queryset=PersonAddress.city.field.related_model.objects.all(),
        write_only=True,
    )

    def validate_zip_code(self, value):  # noqa: PLR6301
        digits = ''.join(filter(str.isdigit, value or ''))
        if len(digits) != 8:  # noqa: PLR2004
            raise serializers.ValidationError(
                'CEP deve conter exatamente 8 dígitos numéricos.'
            )
        return digits

    class Meta:
        model = PersonAddress
        fields = (
            'id',
            'person',
            'label',
            'contact_phone',
            'contact_email',
            'zip_code',
            'address',
            'number',
            'complement',
            'neighborhood',
            'city',
            'city_id',
            'city_name',
            'city_uf',
            'is_default',
            'is_active',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'person', 'city', 'created_at', 'updated_at')

    @extend_schema_field(serializers.CharField())
    @staticmethod
    def get_city_name(obj):
        return obj.city.name if obj.city else ''

    @extend_schema_field(serializers.CharField())
    @staticmethod
    def get_city_uf(obj):
        return obj.city.uf if obj.city else ''

    @transaction.atomic
    def create(self, validated_data):
        person = self.context['person']
        make_default = validated_data.get('is_default', False)
        has_active_address = person.addresses.filter(is_active=True).exists()

        if not has_active_address:
            make_default = True
            validated_data['is_default'] = True

        instance = PersonAddress.objects.create(person=person, **validated_data)
        if make_default:
            person.addresses.exclude(pk=instance.pk).update(is_default=False)
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        # Endereço é imutável: update só pode alterar flags operacionais.
        mutable_fields = frozenset({'is_default', 'is_active'})
        disallowed_changes = set(validated_data.keys()) - mutable_fields
        if disallowed_changes:
            raise serializers.ValidationError(
                'Endereços são imutáveis. Para alterar dados de endereço, '
                'crie um novo registro.'
            )
        make_default = validated_data.get('is_default', instance.is_default)
        validated_data.pop('person', None)
        obj = super().update(instance, validated_data)
        if make_default:
            obj.person.addresses.exclude(pk=obj.pk).update(is_default=False)
        return obj


class PersonCertificateUploadSerializer(serializers.Serializer):
    certificate = serializers.FileField(
        required=True, help_text='Arquivo de certificado digital .pfx'
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        help_text='Senha de proteção do arquivo .pfx.',
    )
    environment = serializers.ChoiceField(
        choices=PersonCertificate.Ambient.choices,
        required=False,
        help_text='Ambiente de emissão: 1=Produção, 2=Homologação.',
    )

    @staticmethod
    def validate(attrs):
        pfx_bytes = attrs['certificate'].read()
        password = attrs['password'].encode()

        try:
            _, cert, _ = pkcs12.load_key_and_certificates(pfx_bytes, password)
        except Exception:
            raise serializers.ValidationError(
                'Arquivo inválido ou senha incorreta. Verifique o certificado .pfx.'
            ) from None

        if cert is None:
            raise serializers.ValidationError(
                'O arquivo não contém um certificado válido.'
            )

        issuer_str = cert.issuer.rfc4514_string()
        if 'ICP-Brasil' not in issuer_str:
            raise serializers.ValidationError(
                'O certificado deve ser emitido por uma autoridade certificadora '
                'vinculada à ICP-Brasil.'
            )

        attrs['_pfx_bytes'] = pfx_bytes
        attrs['_cert_obj'] = cert
        return attrs


class PersonCertificateStatusSerializer(serializers.ModelSerializer):
    """Retorna apenas metadados do certificado — nunca o conteúdo."""

    has_certificate = serializers.SerializerMethodField()

    class Meta:
        model = PersonCertificate
        fields = (
            'has_certificate',
            'environment',
            'cert_expires_at',
            'cert_uploaded_at',
        )
        read_only_fields = ('cert_expires_at', 'cert_uploaded_at')

    @staticmethod
    def get_has_certificate(obj):
        return bool(obj.cert_pfx)


class PersonSerializer(serializers.ModelSerializer):
    person_type = serializers.CharField(read_only=True)
    person_type_display = serializers.CharField(read_only=True)
    addresses = serializers.SerializerMethodField(read_only=True)
    has_certificate = serializers.SerializerMethodField(read_only=True)
    document = serializers.CharField(validators=[validate_cpf_cnpj])
    company_id = serializers.PrimaryKeyRelatedField(
        source='company',
        queryset=Person.company.field.related_model.objects.all(),
        required=False,
    )

    class Meta:
        model = Person
        fields = (
            'id',
            'company_id',
            'name',
            'document',
            'person_type',
            'person_type_display',
            'is_carrier',
            'is_emitente',
            'tp_emit',
            'preferred_series',
            'has_certificate',
            'addresses',
            'is_active',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if request and request.user.is_authenticated and not request.user.is_superadmin:
            fields['company_id'].read_only = True
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        document = attrs.get('document')

        if not document or not request:
            return attrs

        # Determina a empresa da pessoa a ser salva
        company = attrs.get('company') or getattr(request.user, 'company', None)
        if not company:
            return attrs

        qs = Person.objects.filter(company=company, document=document)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            msg = 'Já existe uma pessoa cadastrada com este documento nesta empresa.'
            raise serializers.ValidationError({'document': msg})
        return attrs

    @staticmethod
    def get_has_certificate(obj) -> bool:
        cert = getattr(obj, 'certificate', None)
        return bool(cert and cert.cert_pfx)

    @extend_schema_field(PersonAddressSerializer(many=True))
    @staticmethod
    def get_addresses(obj):
        addresses = (
            obj.addresses
            .filter(is_active=True)
            .select_related('city')
            .order_by('-is_default', '-created_at')
        )
        return PersonAddressSerializer(addresses, many=True).data


class PersonAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonAuditLog
        fields: ClassVar[list] = [
            'id',
            'actor_email',
            'action',
            'person',
            'person_document',
            'changed_fields',
            'ip_address',
            'timestamp',
        ]
        read_only_fields: ClassVar[list] = [
            'id',
            'actor_email',
            'action',
            'person',
            'person_document',
            'changed_fields',
            'ip_address',
            'timestamp',
        ]
