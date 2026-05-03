from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase
from validate_docbr import CNPJ

from apps.companies.models import Company
from apps.locations.models import City
from apps.persons.audit import PersonAuditLog
from apps.persons.models import Person, PersonCertificate
from apps.users.models import Role, RolePermission, User


def _make_person_payload(cnpj_gen, city):
    return {
        'name': 'Empresa Teste',
        'document': cnpj_gen.generate(),
        'zip_code': '80010-000',
        'address': 'Rua das Flores',
        'number': '100',
        'complement': '',
        'neighborhood': 'Centro',
        'city': str(city.pk),
    }


class PersonAuditLogTests(APITestCase):
    def setUp(self):
        self._cnpj = CNPJ()
        self.city = City.objects.get_or_create(
            ibge_code='4106902', defaults={'name': 'Curitiba', 'uf': 'PR'}
        )[0]
        self.company = Company.objects.create(
            name='Auditoria Co', cnpj=self._cnpj.generate()
        )
        self.role = Role.objects.create(company=self.company, name='Admin')
        RolePermission.objects.create(
            role=self.role,
            module=Role.Module.PERSONS,
            can_view=True,
            can_create=True,
            can_edit=True,
            can_delete=True,
        )
        self.admin = User.objects.create_user(
            username='admin@audit.com',
            email='admin@audit.com',
            password='pass',
            company=self.company,
            role=self.role,
            profile=User.Profile.ADMIN,
        )
        self.client.force_authenticate(user=self.admin)

    def test_create_logs_audit(self):
        url = reverse('person-list')
        payload = _make_person_payload(self._cnpj, self.city)
        response = self.client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        log = PersonAuditLog.objects.filter(
            company=self.company, action=PersonAuditLog.Action.CREATE
        ).last()
        assert log is not None
        assert log.actor_email == self.admin.email
        doc_digits = ''.join(c for c in payload['document'] if c.isdigit())
        assert log.person_document == doc_digits

    def test_update_logs_changed_fields(self):
        person = Person.objects.create(
            company=self.company, name='Antes', document=self._cnpj.generate()
        )
        url = reverse('person-detail', kwargs={'pk': person.pk})
        response = self.client.patch(url, {'name': 'Depois'}, format='json')
        assert response.status_code == status.HTTP_200_OK

        log = PersonAuditLog.objects.filter(
            person=person, action=PersonAuditLog.Action.UPDATE
        ).last()
        assert log is not None
        assert 'name' in log.changed_fields
        assert log.changed_fields['name']['from'] == 'Antes'
        assert log.changed_fields['name']['to'] == 'Depois'

    def test_delete_logs_audit(self):
        person = Person.objects.create(
            company=self.company, name='Para deletar', document=self._cnpj.generate()
        )
        url = reverse('person-detail', kwargs={'pk': person.pk})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

        log = PersonAuditLog.objects.filter(action=PersonAuditLog.Action.DELETE).last()
        assert log is not None
        assert log.actor_email == self.admin.email

    def test_audit_log_list_requires_admin(self):
        viewer = User.objects.create_user(
            username='viewer@audit.com',
            email='viewer@audit.com',
            password='pass',
            company=self.company,
            profile=User.Profile.VIEWER,
        )
        self.client.force_authenticate(user=viewer)
        url = reverse('person-audit-log-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_audit_log_list_admin_sees_own_company(self):
        PersonAuditLog.objects.create(
            company=self.company,
            actor=self.admin,
            actor_email=self.admin.email,
            action=PersonAuditLog.Action.CREATE,
            person=None,
            person_document='00000000000000',
            changed_fields={},
        )
        url = reverse('person-audit-log-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] >= 1

    def test_audit_log_isolated_between_companies(self):
        other_company = Company.objects.create(
            name='Outra Empresa', cnpj=self._cnpj.generate()
        )
        PersonAuditLog.objects.create(
            company=other_company,
            actor=None,
            actor_email='outro@outro.com',
            action=PersonAuditLog.Action.CREATE,
            person=None,
            person_document='99999999999999',
            changed_fields={},
        )
        url = reverse('person-audit-log-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        documents = [r['person_document'] for r in response.data['results']]
        assert '99999999999999' not in documents

    def test_update_without_changes_does_not_log(self):
        person = Person.objects.create(
            company=self.company, name='Igual', document=self._cnpj.generate()
        )
        before = PersonAuditLog.objects.filter(
            person=person, action=PersonAuditLog.Action.UPDATE
        ).count()
        url = reverse('person-detail', kwargs={'pk': person.pk})
        # PATCH sem alteração real — name igual ao atual
        self.client.patch(url, {'name': 'Igual'}, format='json')
        after = PersonAuditLog.objects.filter(
            person=person, action=PersonAuditLog.Action.UPDATE
        ).count()
        assert after == before

    def test_certificate_upload_logs_audit(self):
        person = Person.objects.create(
            company=self.company,
            name='Emitente',
            document=self._cnpj.generate(),
            is_emitente=True,
        )
        url = reverse('person-certificate', kwargs={'pk': person.pk})
        fake_pfx = SimpleUploadedFile(
            'cert.pfx', b'fake', content_type='application/octet-stream'
        )
        with (
            patch('apps.persons.views.store_person_certificate') as mock_store,
            patch(
                'apps.persons.views.PersonCertificateUploadSerializer.validate'
            ) as mock_val,
        ):
            mock_val.return_value = {
                '_pfx_bytes': b'fake',
                'password': 'pass',
                '_cert_obj': object(),
                'certificate': fake_pfx,
            }
            cert = PersonCertificate(person=person)
            mock_store.return_value = cert
            response = self.client.post(
                url,
                {'certificate': fake_pfx, 'password': 'pass'},
                format='multipart',
            )
        assert response.status_code == status.HTTP_200_OK
        log = PersonAuditLog.objects.filter(
            person=person, action=PersonAuditLog.Action.CERT_UPLOAD
        ).last()
        assert log is not None
        assert log.actor_email == self.admin.email

    def test_certificate_delete_logs_audit(self):
        person = Person.objects.create(
            company=self.company,
            name='Emitente Del',
            document=self._cnpj.generate(),
            is_emitente=True,
        )
        url = reverse('person-certificate', kwargs={'pk': person.pk})
        with patch('apps.persons.views.remove_person_certificate'):
            response = self.client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        log = PersonAuditLog.objects.filter(
            person=person, action=PersonAuditLog.Action.CERT_DELETE
        ).last()
        assert log is not None

    def test_import_excel_logs_audit(self):
        wb = Workbook()
        ws = wb.active
        ws.append([
            'nome',
            'documento',
            'tipo',
            'cep',
            'logradouro',
            'numero',
            'complemento',
            'bairro',
            'ibge',
            'telefone',
            'email',
        ])
        ws.append([
            'Importada LTDA',
            self._cnpj.generate(),
            'destinatario',
            '80010000',
            'Rua X',
            '1',
            '',
            'Centro',
            self.city.ibge_code,
            '',
            '',
        ])
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        excel_file = SimpleUploadedFile(
            'pessoas.xlsx',
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        url = reverse('person-import-excel')
        response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_201_CREATED

        log = PersonAuditLog.objects.filter(
            company=self.company, action=PersonAuditLog.Action.IMPORT
        ).last()
        assert log is not None
        assert log.changed_fields['created'] == 1
