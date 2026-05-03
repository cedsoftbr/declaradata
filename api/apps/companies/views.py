import uuid
from typing import ClassVar

from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.persons.models import Person
from apps.shipments.models import Shipment
from apps.users.models import User
from apps.users.permissions import IsSuperAdmin, IsSuperAdminOrCompanyManager

from .models import Company
from .serializers import CompanyEnvironmentSerializer, CompanySerializer


def _check_company_access(user, company):
    if not user.is_superadmin and user.company_id != company.id:
        raise PermissionDenied('Você não tem permissão para acessar esta empresa.')


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    filter_backends: ClassVar[list] = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields: ClassVar[list] = ['is_active']
    search_fields: ClassVar[list[str]] = ['name', 'cnpj']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Company.objects.none()

        user = self.request.user
        qs = Company.objects.all().order_by('name')
        if user.is_authenticated and user.is_superadmin:
            return qs
        return qs.filter(id=user.company_id if user.is_authenticated else None)

    def get_permissions(self):
        if self.action in {
            'create',
            'destroy',
            'lgpd_export',
            'lgpd_delete_user',
            'lgpd_delete_person',
        }:
            return [IsSuperAdmin()]
        return [IsSuperAdminOrCompanyManager()]

    @action(detail=True, methods=['get', 'patch'], url_path='environment')
    def environment(self, request, pk=None):  # noqa: ARG002
        """
        GET  /api/companies/{id}/environment/  — retorna configurações de ambiente
        PATCH /api/companies/{id}/environment/ — atualiza environment/current_ambient
        """
        company = self.get_object()
        _check_company_access(request.user, company)

        if request.method == 'GET':
            serializer = CompanyEnvironmentSerializer(company)
            return Response(serializer.data)

        serializer = CompanyEnvironmentSerializer(
            company, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=['get'],
        url_path='lgpd/export',
        permission_classes=[IsSuperAdmin],
    )
    def lgpd_export(self, request, pk=None):  # noqa: ARG002
        company = self.get_object()
        users = company.users.prefetch_related('consent_audits').all()
        persons = company.persons.prefetch_related('addresses').all()
        data = {
            'exported_at': timezone.now().isoformat(),
            'company': {
                'id': str(company.pk),
                'name': company.name,
                'cnpj': company.cnpj,
            },
            'users': [
                {
                    'id': str(u.id),
                    'email': u.email,
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'profile': u.profile,
                    'is_active': u.is_active,
                    'date_joined': u.date_joined.isoformat(),
                    'terms_accepted_at': u.terms_accepted_at.isoformat()
                    if u.terms_accepted_at
                    else None,
                    'privacy_policy_accepted_at': (
                        u.privacy_policy_accepted_at.isoformat()
                        if u.privacy_policy_accepted_at
                        else None
                    ),
                    'consent_history': [
                        {
                            'accepted_at': c.accepted_at.isoformat(),
                            'accepted_terms': c.accepted_terms,
                            'accepted_privacy': c.accepted_privacy,
                            'ip_address': c.ip_address,
                            'legal_terms_version': c.legal_terms_version,
                        }
                        for c in u.consent_audits.all()
                    ],
                }
                for u in users
            ],
            'persons': [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'document': p.document,
                    'is_active': p.is_active,
                    'addresses': [
                        {
                            'zip_code': a.zip_code,
                            'address': a.address,
                            'number': a.number,
                            'neighborhood': a.neighborhood,
                            'contact_email': a.contact_email,
                            'contact_phone': a.contact_phone,
                            'is_active': a.is_active,
                        }
                        for a in p.addresses.all()
                    ],
                }
                for p in persons
            ],
        }
        return Response(data)

    @action(
        detail=True,
        methods=['delete'],
        url_path=r'lgpd/users/(?P<user_id>[^/.]+)',
        permission_classes=[IsSuperAdmin],
    )
    def lgpd_delete_user(self, request, pk=None, user_id=None):  # noqa: ARG002
        company = self.get_object()
        user = get_object_or_404(User, pk=user_id, company=company)
        anon_suffix = uuid.uuid4().hex[:8]
        user.email = f'anonimizado-{anon_suffix}@removido.invalid'
        user.first_name = 'DADO'
        user.last_name = 'REMOVIDO'
        user.is_active = False
        user.session_version += 1
        user.set_unusable_password()
        user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=['delete'],
        url_path=r'lgpd/persons/(?P<person_id>[^/.]+)',
        permission_classes=[IsSuperAdmin],
    )
    def lgpd_delete_person(self, request, pk=None, person_id=None):  # noqa: ARG002
        company = self.get_object()
        person = get_object_or_404(Person, pk=person_id, company=company)

        has_shipments = Shipment.objects.filter(
            models.Q(emitter=person)
            | models.Q(sender=person)
            | models.Q(recipient=person)
            | models.Q(carrier=person)
        ).exists()

        if not has_shipments:
            person.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        anon_doc = 'ANONIMIZADO' + person.document[-4:]
        person.name = 'DADO REMOVIDO'
        person.document = anon_doc
        person.is_active = False
        person.save(update_fields=['name', 'document', 'is_active', 'updated_at'])

        person.addresses.update(
            contact_email='',
            contact_phone='',
            address='DADO REMOVIDO',
            complement='',
        )

        if hasattr(person, 'certificate'):
            person.certificate.delete()

        return Response(
            {'detail': 'Dados pessoais anonimizados. DC-es preservados.'},
            status=status.HTTP_200_OK,
        )
