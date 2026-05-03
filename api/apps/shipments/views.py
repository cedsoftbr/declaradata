import io
import logging
import uuid as _uuid
from typing import ClassVar

from celery.result import AsyncResult
from django.core import signing
from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from pypdf import PdfWriter
from rest_framework import serializers, status as drf_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.core.storage import R2Storage
from apps.core.utils import get_client_ip
from apps.persons.models import Person
from apps.users.models import User
from apps.users.permissions import HasModulePermission, IsSuperAdminOrCompanyManager

from .audit import ShipmentExportLog
from .filters import ShipmentFilter
from .models import Series, Shipment
from .pdf_generator import generate_dce_pdf
from .serializers import (
    SeriesSerializer,
    ShipmentCreateSerializer,
    ShipmentDetailSerializer,
    ShipmentExportLogSerializer,
    ShipmentListSerializer,
)
from .tasks import cancel_shipment_task, emit_shipment_task, export_shipments_xlsx_task

logger = logging.getLogger('apps.shipments')

# Tempo de vida do token de download (segundos)
_DOWNLOAD_TOKEN_MAX_AGE = 3600
_DOWNLOAD_TOKEN_SALT = 'shipment-download'

# Limite de remessas por lote no bulk-pdf
MAX_BULK_PDF_IDS = 100


def _sign_download_token(user_id, shipment_id) -> str:
    """Gera um token assinado e com validade para download de PDF/XML."""
    signer = signing.TimestampSigner(salt=_DOWNLOAD_TOKEN_SALT)
    return signer.sign(f'{user_id}|{shipment_id}')


def _validate_download_token(token: str, expected_shipment_id):
    """
    Valida o token de download e retorna o User correspondente.
    """
    signer = signing.TimestampSigner(salt=_DOWNLOAD_TOKEN_SALT)
    try:
        value = signer.unsign(token, max_age=_DOWNLOAD_TOKEN_MAX_AGE)
        user_id_str, shipment_id_str = value.split('|')
        if _uuid.UUID(shipment_id_str) != _uuid.UUID(str(expected_shipment_id)):
            raise AuthenticationFailed('Token não corresponde a esta remessa.')
        user = User.objects.select_related('company', 'role').get(
            id=_uuid.UUID(user_id_str)
        )
        if not user.is_active:
            raise AuthenticationFailed('Usuário inativo.')
        return user
    except signing.SignatureExpired as exc:
        raise AuthenticationFailed('Token de download expirado.') from exc
    except (signing.BadSignature, ValueError) as exc:
        raise AuthenticationFailed('Token de download inválido.') from exc


class HasShipmentPermission(HasModulePermission):
    module_name = 'dce'
    _action_map: ClassVar[dict] = {
        **HasModulePermission._action_map,
        'emit': 'can_edit',
        'cancel': 'can_edit',
        'xml': 'can_view',
        'pdf': 'can_view',
        'bulk_pdf': 'can_view',
        'export_xlsx': 'can_view',
        'export_xlsx_start': 'can_view',
        'export_xlsx_status': 'can_view',
        'export_xlsx_download': 'can_view',
        'usage': 'can_view',
        'duplicate': 'can_create',
    }


class SeriesViewSet(viewsets.ModelViewSet):
    """
    Gerenciamento de séries de numeração para emitentes.
    """

    serializer_class = SeriesSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated]
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_fields: ClassVar[list] = ['emitter', 'ambient', 'is_active']

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Series.objects.none()
        if hasattr(user, 'is_superadmin') and user.is_superadmin:
            return Series.objects.all()
        return Series.objects.filter(company=user.company)

    def perform_create(self, serializer):
        user = self.request.user
        company = user.company
        if user.is_superadmin:
            emitter_id = self.request.data.get('emitter')
            if emitter_id:
                try:
                    emitter = Person.objects.get(pk=emitter_id)
                    company = emitter.company
                except Person.DoesNotExist:
                    pass

        serializer.save(company=company)

    @transaction.atomic
    def perform_update(self, serializer):  # noqa: PLR6301
        instance = serializer.instance
        new_is_active = serializer.validated_data.get('is_active', instance.is_active)

        if new_is_active and not instance.is_active:
            # Desativa outras séries do mesmo emitente+ambiente antes de ativar esta
            Series.objects.filter(
                emitter=instance.emitter,
                ambient=instance.ambient,
                is_active=True,
            ).exclude(pk=instance.pk).update(is_active=False)

        serializer.save()

    def perform_destroy(self, instance):  # noqa: PLR6301
        if instance.ambient == Series.Ambient.SIMULADO:
            raise serializers.ValidationError(
                'Não é permitido excluir série do ambiente Simulado.'
            )

        if instance.shipments.exists():
            raise serializers.ValidationError(
                'Não é permitido excluir série com emissões vinculadas.'
            )

        if instance.is_active:
            raise serializers.ValidationError(
                'Não é permitido excluir a série ativa. Ative outra série primeiro.'
            )

        instance.delete()


class ShipmentViewSet(viewsets.ModelViewSet):
    """
    CRUD de remessas (DCe).
    """

    module_name = 'dce'
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_class = ShipmentFilter

    def get_permissions(self):
        if not self.request:
            return super().get_permissions()

        path = self.request.path_info
        if any(x in path for x in ['pdf', 'xml', 'bulk-pdf']):
            return [AllowAny()]
        return [IsAuthenticated(), HasShipmentPermission()]

    def get_serializer_class(self):
        if self.action == 'list':
            return ShipmentListSerializer
        if self.action in {'create', 'update', 'partial_update'}:
            return ShipmentCreateSerializer
        return ShipmentDetailSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Shipment.objects.none()
        user = self.request.user
        qs = (
            Shipment.objects
            .select_related(
                'company',
                'sender',
                'recipient',
                'carrier',
                'sender_address',
                'sender_address__city',
                'recipient_address',
                'recipient_address__city',
                'carrier_address',
                'created_by',
            )
            .prefetch_related('items')
            .annotate(total_value=Sum('items__v_prod'))
        )

        if not user.is_authenticated:
            # pdf/xml usam download token; auth real ocorre em _check_shipment_access
            if self.action in {'pdf', 'xml'}:
                return qs
            return Shipment.objects.none()

        if hasattr(user, 'is_superadmin') and user.is_superadmin:
            return qs.order_by('-created_at')
        qs = qs.filter(company_id=user.company_id)
        if getattr(user, 'profile', None) != 'admin':
            allowed_emitente_ids = list(
                user.allowed_emitentes.filter(is_emitente=True).values_list(
                    'id', flat=True
                )
            )
            if allowed_emitente_ids:
                qs = qs.filter(emitter_id__in=allowed_emitente_ids)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        is_superadmin = hasattr(user, 'is_superadmin') and user.is_superadmin
        company = serializer.validated_data.get('company') if is_superadmin else None
        if not is_superadmin:
            serializer.save(company_id=user.company_id, created_by=user)
            return
        serializer.save(company=company, created_by=user)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status not in {Shipment.Status.DRAFT, Shipment.Status.REJECTED}:
            raise serializers.ValidationError(
                'Apenas remessas em rascunho ou rejeitadas podem ser editadas.'
            )
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        shipment = self.get_object()
        if shipment.number is not None:
            return Response(
                {
                    'detail': 'Não é possível excluir remessas '
                    'que já possuem número gerado.'
                },
                status=400,
            )

        if shipment.status != Shipment.Status.DRAFT:
            return Response(
                {'detail': 'Apenas remessas em rascunho podem ser excluídas.'},
                status=400,
            )

        return super().destroy(request, *args, **kwargs)

    @staticmethod
    def _validate_export_task_payload(payload, user):
        if not isinstance(payload, dict):
            raise serializers.ValidationError('Resultado de exportação inválido.')
        if str(payload.get('owner_user_id')) != str(user.id):
            raise PermissionDenied('Você não tem acesso a esta exportação.')
        if not payload.get('key'):
            raise serializers.ValidationError('Arquivo de exportação não encontrado.')
        return payload

    @action(detail=False, methods=['get'], url_path='usage')
    def usage(self, _request):
        """
        GET /api/shipments/usage/
        """
        user = self.request.user
        if user.is_superadmin:
            return Response({'count': 0, 'limit': 100})
        if not user.company_id:
            return Response({
                'count': 0,
                'limit': 100,
                'period': timezone.now().strftime('%m/%Y'),
            })
        company = user.company

        now = timezone.now()

        count = Shipment.objects.filter(
            company_id=user.company_id,
            tp_amb=Shipment.Ambient.PRODUCAO,
            status__in=[
                Shipment.Status.AUTHORIZED,
                Shipment.Status.REJECTED,
                Shipment.Status.CANCELLED,
            ],
            number__isnull=False,
        ).count()

        return Response({
            'count': count,
            'limit': company.monthly_dce_limit if company else 100,
            'period': now.strftime('%m/%Y'),
        })

    @action(detail=False, methods=['post'], url_path='export-xlsx/start')
    def export_xlsx_start(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        shipment_ids = [str(sid) for sid in queryset.values_list('id', flat=True)]
        user = request.user
        is_superadmin = hasattr(user, 'is_superadmin') and user.is_superadmin
        company_id = None if is_superadmin else str(user.company_id)
        task = export_shipments_xlsx_task.delay(shipment_ids, str(user.id), company_id)
        ShipmentExportLog.objects.create(
            company=None if is_superadmin else user.company,
            actor=user,
            actor_email=user.email,
            export_type='xlsx',
            shipment_count=len(shipment_ids),
            filters_applied=dict(request.query_params),
            ip_address=get_client_ip(request),
            task_id=task.id,
        )
        return Response({'task_id': task.id})

    @action(detail=False, methods=['get'], url_path='export-xlsx/status')
    def export_xlsx_status(self, request):
        task_id = request.query_params.get('task_id')
        if not task_id:
            raise serializers.ValidationError('task_id é obrigatório.')

        task = AsyncResult(task_id)
        if task.state in {'PENDING', 'STARTED', 'RETRY'}:
            return Response({'state': task.state, 'ready': False})
        if task.state == 'FAILURE':
            return Response(
                {'state': task.state, 'ready': False, 'error': str(task.result)},
                status=500,
            )
        if task.state != 'SUCCESS':
            return Response({'state': task.state, 'ready': False})

        payload = self._validate_export_task_payload(task.result, request.user)
        return Response({
            'state': task.state,
            'ready': True,
            'filename': payload.get('filename') or 'dce_relatorio.xlsx',
        })

    @action(detail=False, methods=['get'], url_path='export-xlsx/download')
    def export_xlsx_download(self, request):
        task_id = request.query_params.get('task_id')
        if not task_id:
            raise serializers.ValidationError('task_id é obrigatório.')

        task = AsyncResult(task_id)
        if task.state != 'SUCCESS':
            raise serializers.ValidationError(
                'Relatório ainda não finalizado. Aguarde e tente novamente.'
            )

        payload = self._validate_export_task_payload(task.result, request.user)
        storage = R2Storage()
        content = storage.get_file(payload['key'])
        filename = payload.get('filename') or 'dce_relatorio.xlsx'
        return HttpResponse(
            content,
            content_type=(
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ),
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )

    @staticmethod
    @action(detail=False, methods=['get'], url_path='daily-emissions')
    def daily_emissions(request):
        """
        GET /api/shipments/daily-emissions/?days=30
        """
        if not (request.user.is_authenticated and request.user.is_superadmin):
            raise PermissionDenied('Apenas superadmin pode acessar este endpoint.')

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = max(1, min(days, 365))

        since = timezone.now() - timezone.timedelta(days=days)

        rows = (
            Shipment.objects
            .filter(
                status=Shipment.Status.AUTHORIZED,
                dh_emi__gte=since,
            )
            .annotate(day=TruncDate('dh_emi'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        return Response([
            {'date': row['day'].isoformat(), 'count': row['count']} for row in rows
        ])

    @staticmethod
    @action(detail=False, methods=['get'], url_path='top-emitters')
    def top_emitters(request):
        """
        GET /api/shipments/top-emitters/?days=30
        """
        if not (request.user.is_authenticated and request.user.is_superadmin):
            raise PermissionDenied('Apenas superadmin pode acessar este endpoint.')

        try:
            days = int(request.query_params.get('days', 30))
        except ValueError:
            days = 30
        days = max(1, min(days, 365))

        since = timezone.now() - timezone.timedelta(days=days)

        rows = (
            Shipment.objects
            .filter(
                status=Shipment.Status.AUTHORIZED,
                dh_emi__gte=since,
            )
            .values('company__name')
            .annotate(count=Count('id'))
            .order_by('-count')[:6]
        )

        return Response([
            {'company': row['company__name'], 'count': row['count']} for row in rows
        ])

    @action(detail=True, methods=['post'], url_path='download-token')
    def download_token(self, request, pk=None):
        _ = pk
        shipment = self.get_object()
        token = _sign_download_token(request.user.id, shipment.id)
        return Response({'token': token, 'expires_in': _DOWNLOAD_TOKEN_MAX_AGE})

    @action(detail=True, methods=['post'], url_path='emit')
    def emit(self, request, pk=None):
        _ = pk
        shipment = self.get_object()

        if shipment.status not in {Shipment.Status.DRAFT, Shipment.Status.REJECTED}:
            return Response(
                {
                    'detail': 'Apenas remessas em rascunho ou '
                    'rejeitadas podem ser emitidas.'
                },
                status=400,
            )

        if shipment.tp_amb == Shipment.Ambient.PRODUCAO:
            used_in_production = Shipment.objects.filter(
                company_id=shipment.company_id,
                tp_amb=Shipment.Ambient.PRODUCAO,
                status__in=[
                    Shipment.Status.AUTHORIZED,
                    Shipment.Status.REJECTED,
                    Shipment.Status.CANCELLED,
                ],
                number__isnull=False,
            ).count()
            monthly_limit = shipment.company.monthly_dce_limit
            if used_in_production >= monthly_limit:
                return Response(
                    {
                        'detail': (
                            'Limite mensal de DC-e em produção atingido para esta '
                            f'empresa ({monthly_limit}).'
                        )
                    },
                    status=400,
                )

        shipment.start_processing()
        shipment.save(update_fields=['status', 'updated_at'])
        emit_shipment_task.delay(shipment.id)

        serializer = ShipmentDetailSerializer(shipment, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        _ = pk
        source = self.get_object()

        payload = {
            'company': str(source.company_id) if source.company_id else None,
            'emitter_id': str(source.emitter_id) if source.emitter_id else None,
            'sender_id': str(source.sender_id) if source.sender_id else None,
            'recipient_id': str(source.recipient_id) if source.recipient_id else None,
            'carrier_id': str(source.carrier_id) if source.carrier_id else None,
            'sender_address_id': (
                str(source.sender_address_id) if source.sender_address_id else None
            ),
            'recipient_address_id': (
                str(source.recipient_address_id)
                if source.recipient_address_id
                else None
            ),
            'carrier_address_id': (
                str(source.carrier_address_id) if source.carrier_address_id else None
            ),
            'transport_mode': source.transport_mode,
            'tp_transp': source.tp_transp,
            'info_complementar': source.info_complementar,
            'items': [
                {
                    'product_id': str(item.product_id) if item.product_id else None,
                    'x_prod': item.x_prod,
                    'ncm': item.ncm,
                    'q_com': item.q_com,
                    'v_un_com': item.v_un_com,
                }
                for item in source.items.all().order_by('n_item', 'id')
            ],
        }
        serializer = ShipmentCreateSerializer(
            data=payload,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        duplicated = serializer.save(created_by=request.user)
        out = ShipmentDetailSerializer(duplicated, context={'request': request})
        return Response(out.data, status=drf_status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        _ = pk
        shipment = self.get_object()
        if shipment.status != Shipment.Status.AUTHORIZED:
            return Response(
                {'detail': 'Apenas remessas autorizadas podem ser canceladas.'},
                status=400,
            )

        justificativa = str((request.data or {}).get('justificativa', '') or '').strip()
        shipment.start_cancel()
        shipment.save(update_fields=['status', 'updated_at'])
        cancel_shipment_task.delay(str(shipment.id), justificativa)
        serializer = ShipmentDetailSerializer(shipment, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='xml')
    def xml(self, request, pk=None):
        _ = pk
        shipment = self.get_object()
        token = request.query_params.get('token')

        user = request.user
        if token and not user.is_authenticated:
            try:
                user = _validate_download_token(token, shipment.id)
            except AuthenticationFailed:
                try:
                    auth = JWTAuthentication()
                    validated_token = auth.get_validated_token(token)
                    user = auth.get_user(validated_token)
                except Exception:
                    raise AuthenticationFailed('Token inválido ou expirado.') from None

        _check_shipment_access(user, shipment)

        if shipment.xml_key:
            try:
                storage = R2Storage()
                content = storage.get_file(shipment.xml_key)
                filename = f'DCe_{shipment.access_key}.xml'
                return HttpResponse(
                    content,
                    content_type='application/xml',
                    headers={
                        'Content-Disposition': f'attachment; filename="{filename}"'
                    },
                )
            except Exception as e:
                return Response(
                    {'error': f'Erro ao recuperar XML do storage: {e}'}, status=500
                )

        if not shipment.xml_signed:
            raise serializers.ValidationError(
                'Esta remessa ainda não possui XML gerado.'
            )

        filename = f'DCe_{shipment.access_key}.xml'
        return HttpResponse(
            shipment.xml_signed.encode('utf-8'),
            content_type='application/xml',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        _ = pk
        shipment = self.get_object()
        token = request.query_params.get('token')

        user = request.user
        if token and not user.is_authenticated:
            try:
                user = _validate_download_token(token, shipment.id)
            except AuthenticationFailed:
                try:
                    auth = JWTAuthentication()
                    validated_token = auth.get_validated_token(token)
                    user = auth.get_user(validated_token)
                except Exception:
                    raise AuthenticationFailed('Token inválido ou expirado.') from None

        _check_shipment_access(user, shipment)

        if (
            shipment.status == Shipment.Status.DRAFT
            and shipment.tp_amb != Shipment.Ambient.SIMULADO
        ):
            raise serializers.ValidationError(
                'Não é possível gerar PDF para remessas em rascunho.'
            )

        if shipment.pdf_key:
            try:
                storage = R2Storage()
                pdf_content = storage.get_file(shipment.pdf_key)
                filename = f'DCe_{shipment.access_key}.pdf'
                return HttpResponse(
                    pdf_content,
                    content_type='application/pdf',
                    headers={'Content-Disposition': f'inline; filename="{filename}"'},
                )
            except Exception as e:
                logger.warning(f'Falha ao buscar PDF no R2, regerando: {e}')

        pdf_content = generate_dce_pdf(shipment)
        filename = f'DCe_{shipment.access_key}.pdf'
        return HttpResponse(
            pdf_content,
            content_type='application/pdf',
            headers={'Content-Disposition': f'inline; filename="{filename}"'},
        )

    @staticmethod
    @action(detail=False, methods=['get'], url_path='bulk-pdf')
    def bulk_pdf(request):
        token = request.query_params.get('token')
        user = request.user
        if token and not user.is_authenticated:
            try:
                auth = JWTAuthentication()
                validated_token = auth.get_validated_token(token)
                user = auth.get_user(validated_token)
            except Exception:
                return Response(
                    {'detail': 'Token inválido ou expirado.'},
                    status=drf_status.HTTP_401_UNAUTHORIZED,
                )

        if not user.is_authenticated:
            return Response(status=drf_status.HTTP_401_UNAUTHORIZED)

        ids_str = request.query_params.get('ids', '')
        if not ids_str:
            raise serializers.ValidationError('Nenhum ID fornecido.')

        ids = ids_str.split(',')
        if len(ids) > MAX_BULK_PDF_IDS:
            raise serializers.ValidationError(
                f'Máximo de {MAX_BULK_PDF_IDS} remessas por lote.'
            )

        shipments = Shipment.objects.filter(id__in=ids).order_by('number')

        is_superadmin = hasattr(user, 'is_superadmin') and user.is_superadmin
        ShipmentExportLog.objects.create(
            company=None if is_superadmin else getattr(user, 'company', None),
            actor=user,
            actor_email=user.email,
            export_type='pdf_bulk',
            shipment_count=len(ids),
            filters_applied={'ids': ids},
            ip_address=get_client_ip(request),
            task_id='',
        )

        writer = PdfWriter()
        storage = R2Storage()
        for shipment in shipments:
            _check_shipment_access(user, shipment)
            if (
                shipment.status == Shipment.Status.DRAFT
                and shipment.tp_amb != Shipment.Ambient.SIMULADO
            ):
                continue

            pdf_content = None
            if shipment.pdf_key:
                try:
                    pdf_content = storage.get_file(shipment.pdf_key)
                except Exception as e:
                    logger.warning(f'Erro ao buscar PDF {shipment.id} no R2: {e}')

            if not pdf_content:
                pdf_content = generate_dce_pdf(shipment)

            writer.append(io.BytesIO(pdf_content))

        merged_pdf = io.BytesIO()
        writer.write(merged_pdf)
        merged_pdf.seek(0)

        return HttpResponse(
            merged_pdf.read(),
            content_type='application/pdf',
            headers={'Content-Disposition': 'inline; filename="DCE_Lote.pdf"'},
        )


class ShipmentExportLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ShipmentExportLogSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, IsSuperAdminOrCompanyManager]

    def get_queryset(self):
        user = self.request.user
        qs = ShipmentExportLog.objects.select_related('actor')
        if user.is_superadmin:
            return qs
        return qs.filter(company=user.company)


def _check_shipment_access(user, shipment):
    if not user.is_authenticated:
        raise NotAuthenticated()

    is_superadmin = hasattr(user, 'is_superadmin') and user.is_superadmin
    if not is_superadmin and shipment.company_id != user.company_id:
        raise PermissionDenied('Você não tem acesso a este documento.')
    if not is_superadmin and getattr(user, 'profile', None) != 'admin':
        allowed_emitente_ids = set(
            user.allowed_emitentes.filter(is_emitente=True).values_list('id', flat=True)
        )
        if allowed_emitente_ids and shipment.emitter_id not in allowed_emitente_ids:
            raise PermissionDenied('Você não tem acesso a este documento.')
