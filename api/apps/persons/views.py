from typing import ClassVar

from django.db import transaction
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.companies.models import Company
from apps.core.utils import get_client_ip, read_excel_file
from apps.locations.models import City
from apps.users.permissions import HasModulePermission, IsSuperAdminOrCompanyManager

from .audit import PersonAuditLog
from .certificate import remove_person_certificate, store_person_certificate
from .models import Person, PersonAddress
from .serializers import (
    PersonAddressSerializer,
    PersonAuditLogSerializer,
    PersonCertificateEnvironmentSerializer,
    PersonCertificateStatusSerializer,
    PersonCertificateUploadSerializer,
    PersonSerializer,
)

_ADDRESS_CONTENT_FIELDS: tuple[str, ...] = (
    'label',
    'zip_code',
    'address',
    'number',
    'complement',
    'neighborhood',
    'contact_phone',
    'contact_email',
)


def _normalize(v: object) -> str:
    return (str(v) if v is not None else '').strip().lower()


def _resolve_field_value(
    data: dict,
    current: PersonAddress | None,
    field: str,
) -> object:
    """
    Mantém valor atual quando o campo opcional não vem no payload.
    Evita criar nova versão por omissão de campos não editados no front.
    """
    if field in data:
        return data.get(field)
    if current is not None:
        return getattr(current, field)
    return None


def resolve_or_create_address(person: Person, data: dict) -> PersonAddress:
    """
    Resolve endereço de forma idempotente:
    - Se os campos forem iguais ao endereço ativo padrão atual, reutiliza o mesmo.
    - Se houver qualquer diferença, cria nova versão e define como padrão.
    """
    current = person.addresses.filter(is_default=True, is_active=True).first()

    if current:
        same_fields = all(
            _normalize(getattr(current, field))
            == _normalize(_resolve_field_value(data, current, field))
            for field in _ADDRESS_CONTENT_FIELDS
        )
        city_obj = data.get('city') if 'city' in data else current.city
        same_city = str(current.city_id) == str(city_obj.pk if city_obj else '')
        if same_fields and same_city:
            return current

    with transaction.atomic():
        new_addr = PersonAddress.objects.create(
            person=person,
            label=_resolve_field_value(data, current, 'label') or 'Principal',
            contact_phone=_resolve_field_value(data, current, 'contact_phone') or '',
            contact_email=_resolve_field_value(data, current, 'contact_email') or '',
            zip_code=_resolve_field_value(data, current, 'zip_code') or '',
            address=_resolve_field_value(data, current, 'address') or '',
            number=_resolve_field_value(data, current, 'number') or '',
            complement=_resolve_field_value(data, current, 'complement') or '',
            neighborhood=_resolve_field_value(data, current, 'neighborhood') or '',
            city=_resolve_field_value(data, current, 'city'),
            is_default=True,
            is_active=True,
        )
        person.addresses.exclude(pk=new_addr.pk).update(is_default=False)
    return new_addr


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, HasModulePermission]
    module_name = 'persons'
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_fields: ClassVar[list[str]] = [
        'is_carrier',
        'is_active',
        'company',
        'is_emitente',
    ]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Person.objects.none()

        user = self.request.user
        qs = Person.objects.select_related('company', 'certificate').prefetch_related(
            'addresses__city'
        )

        if not user.is_superadmin:
            qs = qs.filter(company=user.company)
            is_emitente_param = self.request.query_params.get('is_emitente')
            if (
                is_emitente_param is not None
                and is_emitente_param.lower() in {'true', '1'}
                and getattr(user, 'profile', None) != 'admin'
            ):
                allowed_emitente_ids = list(
                    user.allowed_emitentes.filter(is_emitente=True).values_list(
                        'id', flat=True
                    )
                )
                if allowed_emitente_ids:
                    qs = qs.filter(id__in=allowed_emitente_ids)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__unaccent__icontains=search) | Q(document__icontains=search)
            )

        has_certificate = self.request.query_params.get('has_certificate')
        if has_certificate is not None:
            if has_certificate.lower() in {'true', '1'}:
                qs = qs.filter(
                    certificate__isnull=False, certificate__cert_pfx__isnull=False
                )
            else:
                qs = qs.filter(
                    Q(certificate__isnull=True) | Q(certificate__cert_pfx__isnull=True)
                )

        return qs.order_by('name')

    def _audit(
        self, action: str, person: Person, changed_fields: dict | None = None
    ) -> None:
        PersonAuditLog.objects.create(
            company=person.company,
            actor=self.request.user,
            actor_email=self.request.user.email,
            action=action,
            person=person,
            person_document=person.document,
            changed_fields=changed_fields or {},
            ip_address=get_client_ip(self.request),
        )

    def perform_create(self, serializer):
        if not self.request.user.is_superadmin:
            instance = serializer.save(company=self.request.user.company)
        else:
            instance = serializer.save()
        self._audit(PersonAuditLog.Action.CREATE, instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        old = {
            f: getattr(instance, f)
            for f in serializer.validated_data
            if hasattr(instance, f)
        }
        serializer.save()
        changed = {
            f: {'from': str(old[f]), 'to': str(getattr(instance, f))}
            for f in old
            if old[f] != getattr(instance, f)
        }
        if changed:
            self._audit(PersonAuditLog.Action.UPDATE, instance, changed)

    def perform_destroy(self, instance):
        self._audit(PersonAuditLog.Action.DELETE, instance)
        instance.delete()

    @action(
        detail=True,
        methods=['post', 'delete'],
        url_path='certificate',
        parser_classes=[MultiPartParser],
    )
    def certificate(self, request, pk=None):
        """
        POST /api/persons/{id}/certificate/
            Recebe o arquivo .pfx e a senha, valida, cifra e armazena.
        DELETE /api/persons/{id}/certificate/
            Remove o certificado armazenado.
        """
        _ = pk
        person = self.get_object()

        if request.method == 'POST':
            serializer = PersonCertificateUploadSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            pfx_bytes = serializer.validated_data['_pfx_bytes']
            password = serializer.validated_data['password']
            cert_obj = serializer.validated_data['_cert_obj']
            environment = serializer.validated_data.get('environment')

            cert_record = store_person_certificate(
                person, pfx_bytes, password, cert_obj, environment=environment
            )
            self._audit(PersonAuditLog.Action.CERT_UPLOAD, person)
            return Response(
                PersonCertificateStatusSerializer(cert_record).data,
                status=status.HTTP_200_OK,
            )

        if request.method == 'DELETE':
            remove_person_certificate(person)
            self._audit(PersonAuditLog.Action.CERT_DELETE, person)
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(
        detail=True,
        methods=['get'],
        url_path='certificate/status',
    )
    def certificate_status(self, request, pk=None):  # noqa: ARG002
        """
        GET /api/persons/{id}/certificate/status/
            Retorna se há certificado, validade e data de envio.
        """
        _ = pk
        person = self.get_object()
        cert_record = getattr(person, 'certificate', None)
        if not cert_record:
            return Response({
                'has_certificate': False,
                'cert_expires_at': None,
                'cert_uploaded_at': None,
            })
        return Response(PersonCertificateStatusSerializer(cert_record).data)

    @action(
        detail=True,
        methods=['patch'],
        url_path='certificate/environment',
    )
    def certificate_environment(self, request, pk=None):  # noqa: ARG002
        """
        PATCH /api/persons/{id}/certificate/environment/
            Atualiza apenas o ambiente do certificado existente.
        """
        person = self.get_object()
        cert_record = getattr(person, 'certificate', None)
        if not cert_record or not cert_record.cert_pfx:
            return Response(
                {'detail': 'Pessoa não possui certificado cadastrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PersonCertificateEnvironmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cert_record.environment = serializer.validated_data['environment']
        cert_record.save(update_fields=['environment', 'updated_at'])
        self._audit(PersonAuditLog.Action.CERT_UPLOAD, person)
        return Response(
            PersonCertificateStatusSerializer(cert_record).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):
        """
        Importa pessoas a partir de um arquivo Excel.
        Estrutura esperada: nome, documento, tipo, cep,
        logradouro, numero, complemento, bairro, ibge
        """
        company = self._get_company_for_import(request)
        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValidationError('Nenhum arquivo enviado.')

        data = read_excel_file(file_obj)
        valid_rows, errors = self._validate_rows(data)

        created_count, updated_count = self._persist_rows(company, valid_rows)

        if created_count or updated_count:
            PersonAuditLog.objects.create(
                company=company,
                actor=self.request.user,
                actor_email=self.request.user.email,
                action=PersonAuditLog.Action.IMPORT,
                person=None,
                person_document='',
                changed_fields={'created': created_count, 'updated': updated_count},
                ip_address=get_client_ip(self.request),
            )

        response_data = {
            'message': (
                f'Importação concluída: {created_count} criados, '
                f'{updated_count} atualizados.'
            ),
            'created': created_count,
            'updated': updated_count,
        }
        if errors:
            response_data['errors'] = errors

        is_success = bool(created_count or updated_count)
        stat = status.HTTP_201_CREATED if is_success else status.HTTP_400_BAD_REQUEST
        return Response(response_data, status=stat)

    @staticmethod
    def _get_company_for_import(request):
        user = request.user
        if user.is_superadmin:
            company_id = request.data.get('company_id')
            if not company_id:
                raise ValidationError(
                    'Superadmins devem informar company_id para importar pessoas.'
                )
            return Company.objects.get(pk=company_id)
        if not user.company:
            raise ValidationError('Usuário não vinculado a uma empresa.')
        return user.company

    @staticmethod
    def _validate_rows(data):
        errors = []
        city_cache = {}
        valid_rows = []

        for index, row in enumerate(data):
            document = str(row.get('documento') or '').strip()
            name = row.get('nome')
            ibge_code = str(row.get('ibge') or '').strip()

            if not document or not name or not ibge_code:
                errors.append(
                    f'Linha {index + 2}: Dados obrigatórios ausentes '
                    '(nome, documento ou ibge).'
                )
                continue

            city = city_cache.get(ibge_code)
            if not city:
                city = City.objects.filter(ibge_code=ibge_code).first()
                if city:
                    city_cache[ibge_code] = city
                else:
                    msg = f'Linha {index + 2}: Cidade {ibge_code} não encontrada.'
                    errors.append(msg)
                    continue

            tipo = str(row.get('tipo') or '').lower()
            valid_rows.append({
                'document': document,
                'name': name,
                'is_carrier': 'transportador' in tipo,
                'contact_phone': str(row.get('telefone') or '').strip(),
                'contact_email': str(row.get('email') or '').strip(),
                'zip_code': str(row.get('cep') or '').strip(),
                'address': row.get('logradouro'),
                'number': str(row.get('numero') or '').strip(),
                'complement': row.get('complemento') or '',
                'neighborhood': row.get('bairro'),
                'city': city,
            })
        return valid_rows, errors

    @staticmethod
    def _persist_rows(company, valid_rows):
        update_fields = [
            'name',
            'is_carrier',
        ]

        with transaction.atomic():
            documents = [r['document'] for r in valid_rows]
            existing = {
                p.document: p
                for p in Person.objects.filter(company=company, document__in=documents)
            }

            to_create = []
            to_update = []

            for row_data in valid_rows:
                doc = row_data['document']
                if doc in existing:
                    person = existing[doc]
                    for field in update_fields:
                        setattr(person, field, row_data[field])
                    to_update.append(person)
                else:
                    to_create.append(
                        Person(
                            company=company,
                            document=row_data['document'],
                            name=row_data['name'],
                            is_carrier=row_data['is_carrier'],
                        )
                    )

            if to_create:
                Person.objects.bulk_create(to_create, batch_size=500)
            if to_update:
                Person.objects.bulk_update(to_update, update_fields, batch_size=500)

            all_persons = {
                p.document: p
                for p in Person.objects.filter(company=company, document__in=documents)
            }
            for row_data in valid_rows:
                person = all_persons[row_data['document']]
                resolve_or_create_address(person, row_data)

        return len(to_create), len(to_update)


class PersonAddressByPersonViewSet(viewsets.ViewSet):
    serializer_class = PersonAddressSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, HasModulePermission]
    module_name = 'persons'

    @staticmethod
    def _get_person(request, pk):
        qs = Person.objects.filter(pk=pk)
        if not request.user.is_superadmin:
            qs = qs.filter(company=request.user.company)
        person = qs.first()
        if not person:
            raise ValidationError('Pessoa não encontrada.')
        return person

    @extend_schema(responses={200: PersonAddressSerializer(many=True)})
    def list(self, request, pk=None):
        person = self._get_person(request, pk)
        addresses = person.addresses.filter(is_active=True).select_related('city')
        serializer = PersonAddressSerializer(addresses, many=True)
        return Response(serializer.data)

    @extend_schema(responses={201: PersonAddressSerializer})
    def create(self, request, pk=None):
        person = self._get_person(request, pk)
        serializer = PersonAddressSerializer(
            data=request.data,
            context={'request': request, 'person': person},
        )
        serializer.is_valid(raise_exception=True)
        address = resolve_or_create_address(person, serializer.validated_data)
        return Response(
            PersonAddressSerializer(address).data, status=status.HTTP_201_CREATED
        )


class PersonAddressViewSet(viewsets.ViewSet):
    serializer_class = PersonAddressSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, HasModulePermission]
    module_name = 'persons'

    @staticmethod
    def _get_address(request, pk):
        qs = PersonAddress.objects.select_related('person__company', 'city').filter(
            pk=pk
        )
        if not request.user.is_superadmin:
            qs = qs.filter(person__company=request.user.company)
        address = qs.first()
        if not address:
            raise ValidationError('Endereço não encontrado.')
        return address

    def destroy(self, request, pk=None):
        address = self._get_address(request, pk)
        address.is_active = False
        if address.is_default:
            address.is_default = False
            replacement = (
                address.person.addresses
                .filter(is_active=True)
                .exclude(pk=address.pk)
                .order_by('-created_at')
                .first()
            )
            if replacement:
                replacement.is_default = True
                replacement.save(update_fields=['is_default', 'updated_at'])
        address.save(update_fields=['is_active', 'is_default', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={200: PersonAddressSerializer})
    @action(detail=True, methods=['post'], url_path='set_default')
    def set_default(self, request, pk=None):
        address = self._get_address(request, pk)
        latest_active = (
            address.person.addresses
            .filter(is_active=True)
            .order_by('-created_at')
            .first()
        )
        if not latest_active or latest_active.pk != address.pk:
            raise ValidationError(
                'Apenas o endereço ativo mais recente pode ser definido como padrão.'
            )
        with transaction.atomic():
            address.person.addresses.exclude(pk=address.pk).update(is_default=False)
            address.is_default = True
            address.is_active = True
            address.save(update_fields=['is_default', 'is_active', 'updated_at'])
        serializer = PersonAddressSerializer(address)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PersonAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PersonAuditLogSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, IsSuperAdminOrCompanyManager]
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_fields: ClassVar[list[str]] = ['action', 'person']

    def get_queryset(self):
        user = self.request.user
        qs = PersonAuditLog.objects.select_related('actor', 'person')
        if user.is_superadmin:
            return qs
        return qs.filter(company=user.company)
