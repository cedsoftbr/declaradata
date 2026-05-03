from typing import ClassVar, override

from django.db import transaction
from django.db.models import Max
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.reverse import reverse

from apps.persons.models import Person, PersonAddress
from apps.persons.serializers import PersonSerializer
from apps.products.models import Product

from .audit import ShipmentExportLog
from .models import Series, Shipment, ShipmentItem
from .services import collect_participants_snapshot

MAX_SERIE_VALUE = 999


class SeriesSerializer(serializers.ModelSerializer):
    change_last_number = serializers.BooleanField(
        write_only=True, required=False, default=False
    )

    class Meta:
        model = Series
        fields = (
            'id',
            'company',
            'emitter',
            'ambient',
            'code',
            'last_number',
            'is_active',
            'updated_at',
            'change_last_number',
        )
        read_only_fields = ('id', 'company', 'updated_at')

    def validate_code(self, value):  # noqa: PLR6301
        if not (1 <= value <= MAX_SERIE_VALUE):
            raise serializers.ValidationError(
                f'Série inválida. Informe um valor entre 1 e {MAX_SERIE_VALUE}.'
            )
        return value

    def validate(self, attrs):
        instance = self.instance
        change_last_number = attrs.pop('change_last_number', False)

        ambient = attrs.get('ambient', getattr(instance, 'ambient', None))

        # Bloqueia criação de nova série SIMULADO se a empresa não permite
        if not instance and ambient == Series.Ambient.SIMULADO:
            request = self.context.get('request')
            if (
                request
                and request.user.is_authenticated
                and not request.user.is_superadmin
            ):
                company = request.user.company
                if not company.allow_simulated_environment_for_emitters:
                    raise serializers.ValidationError({
                        'ambient': (
                            'O ambiente Simulado não é permitido nesta empresa. '
                            'Adicione um certificado digital para usar '
                            'Homologação ou Produção.'
                        )
                    })

        # Restrições do ambiente Simulado (apenas em updates)
        if (
            instance
            and ambient == Series.Ambient.SIMULADO
            and 'code' in attrs
            and attrs['code'] != instance.code
        ):
            raise serializers.ValidationError({
                'code': 'Não é permitido alterar a série no ambiente Simulado.'
            })

        # Validação de sequência monotônica
        if instance and 'last_number' in attrs:
            new_last_number = attrs['last_number']
            if not change_last_number:
                # Sem a flag, ignora alteração de last_number
                attrs.pop('last_number')
            else:
                maior_emitido = (
                    instance.shipments.filter(number__isnull=False).aggregate(
                        max_number=Max('number')
                    )['max_number']
                    or 0
                )
                piso = max(instance.last_number, maior_emitido)
                if new_last_number < piso:
                    raise serializers.ValidationError({
                        'last_number': (
                            f'Não é permitido informar número menor que o maior número '
                            f'já utilizado nesta série ({piso}).'
                        )
                    })

        return attrs


class ShipmentItemSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=False, required=False)
    product_id = serializers.PrimaryKeyRelatedField(
        source='product',
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ShipmentItem
        fields = (
            'id',
            'product_id',
            'x_prod',
            'n_item',
            'ncm',
            'q_com',
            'v_un_com',
            'v_prod',
        )
        read_only_fields = ('n_item', 'v_prod')

    @override
    def validate(self, attrs):
        if attrs.get('q_com', 0) <= 0:
            raise serializers.ValidationError({
                'q_com': 'Quantidade deve ser positiva.'
            })
        if attrs.get('v_un_com', 0) < 0:
            raise serializers.ValidationError({
                'v_un_com': 'Valor unitário não pode ser negativo.'
            })
        attrs['v_prod'] = round(attrs['q_com'] * attrs['v_un_com'], 2)
        return attrs


class ShipmentListSerializer(serializers.ModelSerializer):
    emitter_name = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()
    sender_city_uf = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    recipient_city_uf = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    total_value = serializers.DecimalField(
        read_only=True, max_digits=13, decimal_places=2, default=0
    )
    pdf_url = serializers.SerializerMethodField()
    xml_url = serializers.SerializerMethodField()
    rejection_reason = serializers.CharField(
        source='last_emission_error', read_only=True
    )

    class Meta:
        model = Shipment
        fields = (
            'id',
            'company',
            'emitter',
            'sender',
            'recipient',
            'carrier',
            'sender_address',
            'recipient_address',
            'carrier_address',
            'serie',
            'number',
            'tp_emit',
            'tp_amb',
            'transport_mode',
            'tp_transp',
            'status',
            'access_key',
            'protocol',
            'emitter_name',
            'sender_name',
            'sender_city_uf',
            'recipient_name',
            'recipient_city_uf',
            'created_by_name',
            'total_value',
            'pdf_url',
            'xml_url',
            'info_complementar',
            'info_fisco',
            'rejection_reason',
            'dh_emi',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_emitter_name(obj):
        emitter_snapshot = (obj.participants_snapshot or {}).get('emitter')
        if emitter_snapshot:
            return emitter_snapshot.get('name')
        # fallback legado
        if obj.emit_snapshot:
            return obj.emit_snapshot.get('name')
        return obj.emitter.name if obj.emitter else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_sender_name(obj):
        if obj.sender_snapshot:
            return obj.sender_snapshot.get('name')
        return obj.sender.name if obj.sender else None

    @staticmethod
    def _format_city_uf(city_name, city_uf):
        city_name = (city_name or '').strip()
        city_uf = (city_uf or '').strip()
        if city_name and city_uf:
            return f'{city_name}/{city_uf}'
        return city_name or city_uf or None

    @classmethod
    def _city_uf_from_snapshot(cls, snapshot):
        if not snapshot:
            return None
        city_name = (
            snapshot.get('city_name')
            or snapshot.get('city')
            or snapshot.get('x_mun')
            or ''
        )
        city_uf = (
            snapshot.get('city_uf') or snapshot.get('uf') or snapshot.get('u_f') or ''
        )
        return cls._format_city_uf(city_name, city_uf)

    @staticmethod
    def _resolve_city_uf_from_person(person):
        if not person:
            return None
        address = (
            person.addresses
            .filter(is_active=True, is_default=True)
            .select_related('city')
            .first()
            or person.addresses.filter(is_active=True).select_related('city').first()
        )
        if not address or not address.city:
            return None
        return ShipmentListSerializer._format_city_uf(
            address.city.name, address.city.uf
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_sender_city_uf(self, obj):
        if obj.sender_snapshot:
            value = self._city_uf_from_snapshot(obj.sender_snapshot)
            if value:
                return value
        if obj.sender_address and obj.sender_address.city:
            return self._format_city_uf(
                obj.sender_address.city.name,
                obj.sender_address.city.uf,
            )
        return self._resolve_city_uf_from_person(obj.sender)

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_recipient_name(obj):
        if obj.recipient_snapshot:
            return obj.recipient_snapshot.get('name')
        return obj.recipient.name if obj.recipient else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_recipient_city_uf(self, obj):
        if obj.recipient_snapshot:
            value = self._city_uf_from_snapshot(obj.recipient_snapshot)
            if value:
                return value
        if obj.recipient_address and obj.recipient_address.city:
            return self._format_city_uf(
                obj.recipient_address.city.name,
                obj.recipient_address.city.uf,
            )
        return self._resolve_city_uf_from_person(obj.recipient)

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_created_by_name(obj):
        if not obj.created_by:
            return None
        parts = [obj.created_by.first_name, obj.created_by.last_name]
        name = ' '.join(p for p in parts if p).strip()
        return name or obj.created_by.email

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_pdf_url(self, obj):
        if obj.status == Shipment.Status.DRAFT:
            return None
        request = self.context.get('request')
        if not request:
            return None
        return reverse('shipment-pdf', kwargs={'pk': obj.pk}, request=request)

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_xml_url(self, obj):
        if obj.status == Shipment.Status.DRAFT:
            return None
        request = self.context.get('request')
        if not request:
            return None
        return reverse('shipment-xml', kwargs={'pk': obj.pk}, request=request)


class ShipmentDetailSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    emitter_detail = PersonSerializer(source='emitter', read_only=True)
    sender_detail = PersonSerializer(source='sender', read_only=True)
    recipient_detail = PersonSerializer(source='recipient', read_only=True)
    carrier_detail = PersonSerializer(source='carrier', read_only=True)
    total_value = serializers.DecimalField(
        read_only=True, max_digits=13, decimal_places=2, default=0
    )
    pdf_url = serializers.SerializerMethodField()
    xml_url = serializers.SerializerMethodField()
    items = ShipmentItemSerializer(many=True, read_only=True)
    emit_snapshot = serializers.JSONField(read_only=True)
    sender_snapshot = serializers.JSONField(read_only=True)
    recipient_snapshot = serializers.JSONField(read_only=True)
    carrier_snapshot = serializers.JSONField(read_only=True)
    rejection_reason = serializers.CharField(
        source='last_emission_error', read_only=True
    )

    class Meta:
        model = Shipment
        fields = (
            'id',
            'company',
            'emitter',
            'sender',
            'recipient',
            'carrier',
            'sender_address',
            'recipient_address',
            'carrier_address',
            'emitter_detail',
            'sender_detail',
            'recipient_detail',
            'carrier_detail',
            'serie',
            'number',
            'tp_emit',
            'tp_amb',
            'transport_mode',
            'tp_transp',
            'status',
            'access_key',
            'protocol',
            'rejection_reason',
            'info_complementar',
            'info_fisco',
            'qr_code_url',
            'url_chave',
            'xml_signed',
            'dh_emi',
            'dh_recbto',
            'participants_snapshot',
            'emit_snapshot',
            'sender_snapshot',
            'recipient_snapshot',
            'carrier_snapshot',
            'sender_name',
            'recipient_name',
            'total_value',
            'pdf_url',
            'xml_url',
            'items',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_emitter_name(obj):
        emitter_snapshot = (obj.participants_snapshot or {}).get('emitter')
        if emitter_snapshot:
            return emitter_snapshot.get('name')
        # fallback legado
        if obj.emit_snapshot:
            return obj.emit_snapshot.get('name')
        return obj.emitter.name if obj.emitter else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_sender_name(obj):
        if obj.sender_snapshot:
            return obj.sender_snapshot.get('name')
        return obj.sender.name if obj.sender else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_recipient_name(obj):
        if obj.recipient_snapshot:
            return obj.recipient_snapshot.get('name')
        return obj.recipient.name if obj.recipient else None

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_pdf_url(self, obj):
        if obj.status == Shipment.Status.DRAFT:
            return None
        request = self.context.get('request')
        if not request:
            return None
        return reverse('shipment-pdf', kwargs={'pk': obj.pk}, request=request)

    @extend_schema_field(serializers.URLField(allow_null=True))
    def get_xml_url(self, obj):
        if obj.status == Shipment.Status.DRAFT:
            return None
        request = self.context.get('request')
        if not request:
            return None
        return reverse('shipment-xml', kwargs={'pk': obj.pk}, request=request)


class ShipmentCreateSerializer(serializers.ModelSerializer):
    emitter_id = serializers.PrimaryKeyRelatedField(
        source='emitter',
        queryset=Person.objects.filter(is_emitente=True),
        required=True,
    )
    sender_id = serializers.PrimaryKeyRelatedField(
        source='sender',
        queryset=Person.objects.all(),
        required=False,
        allow_null=True,
    )
    recipient_id = serializers.PrimaryKeyRelatedField(
        source='recipient',
        queryset=Person.objects.all(),
    )
    carrier_id = serializers.PrimaryKeyRelatedField(
        source='carrier',
        queryset=Person.objects.filter(is_carrier=True),
        required=False,
        allow_null=True,
    )
    sender_address_id = serializers.PrimaryKeyRelatedField(
        source='sender_address',
        queryset=PersonAddress.objects.all(),
        required=False,
        allow_null=True,
    )
    recipient_address_id = serializers.PrimaryKeyRelatedField(
        source='recipient_address',
        queryset=PersonAddress.objects.all(),
        required=False,
        allow_null=True,
    )
    carrier_address_id = serializers.PrimaryKeyRelatedField(
        source='carrier_address',
        queryset=PersonAddress.objects.all(),
        required=False,
        allow_null=True,
    )
    series_id = serializers.PrimaryKeyRelatedField(
        source='series',
        queryset=Series.objects.all(),
        required=False,
        allow_null=True,
    )
    items = ShipmentItemSerializer(many=True)

    class Meta:
        model = Shipment
        fields = (
            'id',
            'company',
            'emitter_id',
            'sender_id',
            'recipient_id',
            'carrier_id',
            'sender_address_id',
            'recipient_address_id',
            'carrier_address_id',
            'series_id',
            'serie',
            'tp_amb',
            'transport_mode',
            'tp_transp',
            'info_complementar',
            'info_fisco',
            'items',
        )
        read_only_fields = ('id',)
        extra_kwargs: ClassVar[dict] = {
            'company': {'required': False},
            'tp_amb': {'required': False},
            'serie': {'required': False},
        }

    @override
    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return fields
        if not request.user.is_superadmin:
            # Gestor só pode atribuir persons e series da própria empresa
            company = request.user.company
            allowed_emitente_ids = []
            if getattr(request.user, 'profile', None) != 'admin':
                allowed_emitente_ids = list(
                    request.user.allowed_emitentes.filter(is_emitente=True).values_list(
                        'id', flat=True
                    )
                )
            items_field = fields.get('items')
            if items_field and getattr(items_field, 'child', None):
                items_field.child.fields[
                    'product_id'
                ].queryset = Product.objects.filter(company=company)
            emitter_qs = Person.objects.filter(company=company, is_emitente=True)
            if allowed_emitente_ids:
                emitter_qs = emitter_qs.filter(id__in=allowed_emitente_ids)
            fields['emitter_id'].queryset = emitter_qs
            fields['sender_id'].queryset = Person.objects.filter(company=company)
            fields['recipient_id'].queryset = Person.objects.filter(company=company)
            fields['carrier_id'].queryset = Person.objects.filter(
                company=company, is_carrier=True
            )
            fields['sender_address_id'].queryset = PersonAddress.objects.filter(
                person__company=company,
                is_active=True,
            )
            fields['recipient_address_id'].queryset = PersonAddress.objects.filter(
                person__company=company,
                is_active=True,
            )
            fields['carrier_address_id'].queryset = PersonAddress.objects.filter(
                person__company=company,
                is_active=True,
            )
            fields['series_id'].queryset = Series.objects.filter(company=company)
        return fields

    @override
    def validate(self, attrs):  # noqa: PLR0912, PLR0914
        attrs = super().validate(attrs)

        emitter = attrs.get('emitter')
        series = attrs.get('series')
        request = self.context.get('request')
        company = attrs.get('company')
        if company is None and self.instance is not None:
            company = self.instance.company
        if (
            company is None
            and request
            and request.user.is_authenticated
            and not request.user.is_superadmin
        ):
            company = request.user.company

        # Bloqueia ambiente SIMULADO quando a empresa não permite
        tp_amb = attrs.get('tp_amb', getattr(self.instance, 'tp_amb', None))
        if (
            company
            and tp_amb == Shipment.Ambient.SIMULADO
            and not company.allow_simulated_environment_for_emitters
        ):
            raise serializers.ValidationError({
                'tp_amb': (
                    'O ambiente Simulado não é permitido nesta empresa. '
                    'Adicione um certificado digital para usar Homologação ou Produção.'
                )
            })

        if emitter and not attrs.get('tp_emit'):
            attrs['tp_emit'] = emitter.tp_emit

        if (
            request
            and request.user.is_authenticated
            and not request.user.is_superadmin
            and emitter
            and getattr(request.user, 'profile', None) != 'admin'
        ):
            allowed_emitente_ids = set(
                request.user.allowed_emitentes.filter(is_emitente=True).values_list(
                    'id', flat=True
                )
            )
            if allowed_emitente_ids and emitter.id not in allowed_emitente_ids:
                raise serializers.ValidationError({
                    'emitter_id': (
                        'Você não tem permissão para criar/editar DCE para este '
                        'emitente.'
                    )
                })

        # Se a série foi informada, valida que pertence ao emitente
        if series and emitter and series.emitter_id and series.emitter_id != emitter.id:
            raise serializers.ValidationError({
                'series_id': 'A série selecionada não pertence ao emitente informado.'
            })

        default_tp = Shipment.TpTransp.TERCEIRIZADO
        instance_tp = getattr(self.instance, 'tp_transp', default_tp)
        tp_transp = attrs.get('tp_transp', instance_tp)
        tp_emit = attrs.get('tp_emit', getattr(self.instance, 'tp_emit', None))
        carrier = attrs.get('carrier', getattr(self.instance, 'carrier', None))

        needs_carrier = (
            tp_transp == Shipment.TpTransp.TERCEIRIZADO
            or tp_emit == Shipment.EmitType.TRANSPORTADORA
        )
        if needs_carrier and not carrier:
            msg = (
                'Transportador é obrigatório para tipo Terceirizado.'
                if tp_transp == Shipment.TpTransp.TERCEIRIZADO
                else (
                    'Transportador é obrigatório quando o tipo de emitente '
                    'for Transportadora.'
                )
            )
            raise serializers.ValidationError({'carrier_id': msg})

        if not needs_carrier:
            attrs['carrier'] = None
            attrs['carrier_address'] = None

        for role in ('sender', 'recipient', 'carrier'):
            person = attrs.get(role)
            address = attrs.get(f'{role}_address')
            if not address:
                continue
            if not person:
                raise serializers.ValidationError({
                    f'{role}_address_id': f'Informe {role}_id para usar este endereço.'
                })
            if address.person_id != person.id:
                raise serializers.ValidationError({
                    f'{role}_address_id': 'Endereço não pertence à pessoa informada.'
                })

        if company is not None:
            for item in attrs.get('items', []):
                product = item.get('product')
                if product and product.company_id != company.id:
                    raise serializers.ValidationError({
                        'items': (
                            'Todos os produtos dos itens devem pertencer à mesma '
                            'empresa da remessa.'
                        )
                    })
        return attrs

    @override
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Pelo menos um item é obrigatório.')
        return value

    @staticmethod
    def validate_serie(value):
        if value is None:
            return value
        if value < 1 or value > MAX_SERIE_VALUE:
            raise serializers.ValidationError(
                f'Série inválida. Informe um valor entre 001 e {MAX_SERIE_VALUE}.'
            )
        return value

    @override
    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        # DCe rejeitado volta para rascunho ao ser editado
        if instance.status == instance.Status.REJECTED:
            instance.reset_rejected()

        # Sincroniza serie/tp_amb se series_id mudou
        series = validated_data.get('series')
        if series:
            validated_data['serie'] = series.code
            validated_data['tp_amb'] = series.ambient

        if items_data is not None:
            existing_ids = {
                str(item_id) for item_id in instance.items.values_list('id', flat=True)
            }
            incoming_ids = {str(d['id']) for d in items_data if d.get('id')}
            unknown_ids = incoming_ids - existing_ids
            if unknown_ids:
                raise serializers.ValidationError({
                    'items': 'Payload contém item(id) que não pertence à remessa.'
                })

            instance.items.exclude(pk__in=incoming_ids).delete()
            for idx, item_data in enumerate(items_data, start=1):
                item_id = item_data.pop('id', None)
                item_data['n_item'] = idx
                item_data['v_prod'] = round(
                    item_data['q_com'] * item_data['v_un_com'], 2
                )
                if item_id and instance.items.filter(pk=item_id).exists():
                    instance.items.filter(pk=item_id).update(**item_data)
                else:
                    ShipmentItem.objects.create(shipment=instance, **item_data)

        instance = super().update(instance, validated_data)
        instance.participants_snapshot = collect_participants_snapshot(instance)
        instance.save(update_fields=['participants_snapshot', 'updated_at'])
        return instance

    @override
    def create(self, validated_data):
        items_data = validated_data.pop('items')

        request = self.context.get('request')
        company = validated_data.get('company')
        if (
            company is None
            and request
            and request.user.is_authenticated
            and not request.user.is_superadmin
        ):
            company = request.user.company

        if company is not None:
            validated_data['company'] = company

            emitter = validated_data.get('emitter')
            series = validated_data.get('series')
            if not series:
                ambient = validated_data.get('tp_amb') or company.current_ambient

                # Tenta a série ativa do emitente para o ambiente
                if emitter:
                    series = Series.objects.filter(
                        company=company,
                        emitter=emitter,
                        ambient=ambient,
                        is_active=True,
                    ).first()

                if not series:
                    serie_code = validated_data.get('serie') or (
                        emitter.preferred_series if emitter else 1
                    )
                    series, _ = Series.objects.get_or_create(
                        company=company,
                        emitter=emitter,
                        ambient=ambient,
                        code=serie_code,
                        defaults={'last_number': 0},
                    )
                validated_data['series'] = series

            validated_data['tp_amb'] = series.ambient
            validated_data['serie'] = series.code

        # number e c_dc são atribuídos atomicamente no momento da geração do XML
        shipment = Shipment.objects.create(**validated_data)
        shipment.participants_snapshot = collect_participants_snapshot(shipment)
        shipment.save(update_fields=['participants_snapshot', 'updated_at'])
        for idx, item_data in enumerate(items_data, start=1):
            item_data['n_item'] = idx
            ShipmentItem.objects.create(shipment=shipment, **item_data)
        return shipment


class ShipmentExportLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentExportLog
        fields: ClassVar[list] = [
            'id',
            'actor_email',
            'export_type',
            'shipment_count',
            'filters_applied',
            'ip_address',
            'task_id',
            'timestamp',
        ]
        read_only_fields: ClassVar[list] = [
            'id',
            'actor_email',
            'export_type',
            'shipment_count',
            'filters_applied',
            'ip_address',
            'task_id',
            'timestamp',
        ]
