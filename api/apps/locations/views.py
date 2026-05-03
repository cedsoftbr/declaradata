from typing import ClassVar

from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.utils import read_excel_file

from .models import City
from .serializers import CitySerializer


class CityViewSet(viewsets.ModelViewSet):
    queryset = City.objects.all().order_by('uf', 'name')
    serializer_class = CitySerializer
    permission_classes: ClassVar[list] = [IsAuthenticated]
    filter_backends: ClassVar[list] = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields: ClassVar[list[str]] = ['uf', 'ibge_code']
    search_fields: ClassVar[list[str]] = ['name', 'ibge_code', 'uf']

    @action(detail=False, methods=['post'], url_path='import-excel')
    def import_excel(self, request):  # noqa: PLR6301
        """
        Importa cidades a partir de um arquivo Excel.
        Estrutura esperada: cidade, uf, ibge
        """
        if not request.user.is_superadmin:
            return Response(
                {'detail': 'Apenas superadmins podem importar cidades.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_obj = request.FILES.get('file')
        if not file_obj:
            raise ValidationError('Nenhum arquivo enviado.')

        data = read_excel_file(file_obj)
        created_count = 0
        updated_count = 0

        with transaction.atomic():
            for row in data:
                name = row.get('cidade')
                uf = row.get('uf')
                ibge_code = str(row.get('ibge'))

                if not all([name, uf, ibge_code]):
                    continue

                _city, created = City.objects.update_or_create(
                    ibge_code=ibge_code,
                    defaults={'name': name, 'uf': uf},
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        return Response(
            {
                'message': (
                    f'Importação concluída: {created_count} criados, '
                    f'{updated_count} atualizados.'
                ),
                'created': created_count,
                'updated': updated_count,
            },
            status=status.HTTP_201_CREATED,
        )
