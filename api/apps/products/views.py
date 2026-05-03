from typing import ClassVar

from django.db import transaction
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.companies.models import Company
from apps.core.utils import read_excel_file
from apps.users.permissions import HasModulePermission, IsSuperAdmin

from .models import NcmCatalog, Product
from .serializers import NcmCatalogSerializer, ProductSerializer

NCM_LENGTH = 8


class NcmCatalogViewSet(viewsets.ModelViewSet):
    serializer_class = NcmCatalogSerializer
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_fields: ClassVar[list[str]] = ['ncm']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return NcmCatalog.objects.none()
        return NcmCatalog.objects.all()

    def get_permissions(self):
        if self.action in {'list', 'retrieve'}:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsSuperAdmin()]

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):  # noqa: PLR6301
        """
        Importa NCMs a partir de um arquivo Excel.
        Estrutura esperada: ncm
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValidationError('Nenhum arquivo enviado.')

        data = read_excel_file(file_obj)

        with transaction.atomic():
            ncm_list = []
            for r in data:
                raw = str(r.get('ncm') or '').strip().replace('.', '').replace('-', '')
                digits = ''.join(c for c in raw if c.isdigit())
                if len(digits) == NCM_LENGTH:
                    ncm_list.append(digits)

            existing = set(
                NcmCatalog.objects.filter(ncm__in=ncm_list).values_list(
                    'ncm', flat=True
                )
            )
            to_create = [
                NcmCatalog(ncm=ncm)
                for ncm in dict.fromkeys(ncm_list)
                if ncm not in existing
            ]
            created_objects = NcmCatalog.objects.bulk_create(
                to_create, batch_size=500, ignore_conflicts=True
            )
            created_count = sum(1 for obj in created_objects if obj.pk is not None)
            skipped_count = len(ncm_list) - created_count

        return Response(
            {
                'message': (
                    f'Importação concluída: {created_count} criados, '
                    f'{skipped_count} ignorados (já existentes).'
                ),
                'created': created_count,
                'skipped': skipped_count,
            },
            status=status.HTTP_201_CREATED,
        )


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes: ClassVar[list] = [IsAuthenticated, HasModulePermission]
    module_name = 'products'
    filter_backends: ClassVar[list] = [DjangoFilterBackend]
    filterset_fields: ClassVar[list[str]] = ['ncm', 'company']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Product.objects.none()

        user = self.request.user
        qs = Product.objects.select_related('company')

        if not user.is_superadmin:
            qs = qs.filter(company=user.company)

        search = self.request.query_params.get('search')
        if search:
            # unaccent ignora acentos na busca
            qs = qs.filter(
                Q(descricao__unaccent__icontains=search) | Q(ncm__icontains=search)
            )

        return qs.order_by('descricao')

    def perform_create(self, serializer):
        if not self.request.user.is_superadmin:
            serializer.save(company=self.request.user.company)
        else:
            serializer.save()

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):  # noqa: PLR6301
        """
        Importa produtos a partir de um arquivo Excel.
        Estrutura esperada: descricao, ncm
        """
        user = request.user
        company = user.company

        if user.is_superadmin:
            company_id = request.data.get('company_id')
            if not company_id:
                raise ValidationError(
                    'Superadmins devem informar company_id para importar produtos.'
                )
            company = Company.objects.get(pk=company_id)
        elif not company:
            raise ValidationError('Usuário não vinculado a uma empresa.')

        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValidationError('Nenhum arquivo enviado.')

        data = read_excel_file(file_obj)

        with transaction.atomic():
            ncm_desc_pairs = [
                (str(r.get('ncm') or '').strip(), r.get('descricao'))
                for r in data
                if r.get('descricao')
            ]
            existing = {
                (p.ncm, p.descricao)
                for p in Product.objects.filter(
                    company=company,
                    ncm__in=[pair[0] for pair in ncm_desc_pairs],
                )
            }
            to_create = [
                Product(company=company, ncm=ncm, descricao=desc)
                for ncm, desc in ncm_desc_pairs
                if (ncm, desc) not in existing
            ]
            created_objects = Product.objects.bulk_create(
                to_create, batch_size=500, ignore_conflicts=True
            )
            # ignore_conflicts=True: objetos com conflito não recebem PK do banco
            created_count = sum(1 for obj in created_objects if obj.pk is not None)
            skipped_count = len(ncm_desc_pairs) - created_count

        return Response(
            {
                'message': (
                    f'Importação concluída: {created_count} criados, '
                    f'{skipped_count} ignorados (já existentes).'
                ),
                'created': created_count,
                'skipped': skipped_count,
            },
            status=status.HTTP_201_CREATED,
        )
