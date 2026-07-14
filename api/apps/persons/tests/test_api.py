from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from validate_docbr import CNPJ

from apps.companies.models import Company
from apps.locations.models import City
from apps.persons.models import Person
from apps.users.models import Role, RolePermission, User


class PersonTests(APITestCase):
    def setUp(self):
        self._cnpj_gen = CNPJ()
        self.city = City.objects.create(name='Curitiba', uf='PR', ibge_code='4106902')
        self.company = Company.objects.create(
            name='Test Co', cnpj=self._cnpj_gen.generate()
        )
        self.role = Role.objects.create(company=self.company, name='Gestor')
        RolePermission.objects.create(
            role=self.role,
            module=Role.Module.PERSONS,
            can_view=True,
            can_create=True,
        )

        self.user = User.objects.create_user(
            username='gestor@test.com',
            email='gestor@test.com',
            password='password123',
            company=self.company,
            role=self.role,
        )
        self.client.force_authenticate(user=self.user)

    def test_list_persons(self):
        Person.objects.create(
            company=self.company,
            name='João da Silva',
            document='12345678901',
        )
        url = reverse('person-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # Esperamos 2: A pessoa auto-criada pelo signal (da Company) + João da Silva
        assert response.data['count'] == 2

    def test_create_person(self):
        url = reverse('person-list')
        data = {
            'name': 'Pessoa Teste',
            'document': self._cnpj_gen.generate(),
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_superadmin_create_person(self):
        superadmin = User.objects.create_superuser(
            username='super3@test.com',
            email='super3@test.com',
            password='password123',
        )
        self.client.force_authenticate(user=superadmin)
        url = reverse('person-list')
        data = {
            'company_id': self.company.id,
            'name': 'Pessoa Super',
            'document': self._cnpj_gen.generate(),
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_update_person(self):
        person = Person.objects.create(
            company=self.company,
            name='Original Name',
            document=self._cnpj_gen.generate(),
        )
        RolePermission.objects.filter(
            role=self.role, module=Role.Module.PERSONS
        ).update(can_edit=True)

        url = reverse('person-detail', kwargs={'pk': person.id})
        response = self.client.patch(url, {'name': 'Updated Name'})
        assert response.status_code == status.HTTP_200_OK
        person.refresh_from_db()
        assert person.name == 'Updated Name'

    def test_delete_person(self):
        person = Person.objects.create(
            company=self.company,
            name='To Delete',
            document=self._cnpj_gen.generate(),
        )
        RolePermission.objects.filter(
            role=self.role, module=Role.Module.PERSONS
        ).update(can_delete=True)

        url = reverse('person-detail', kwargs={'pk': person.id})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Person.objects.filter(id=person.id).exists()
        # Sobra apenas a pessoa auto-criada pelo signal
        assert Person.objects.filter(company=self.company).count() == 1

    def test_import_excel_persons_success(self):
        url = reverse('person-list') + 'import-excel/'
        excel_file = SimpleUploadedFile('persons.xlsx', b'fake data')
        mock_data = [
            {
                'nome': 'Imported Person',
                'documento': self._cnpj_gen.generate(),
                'tipo': 'cliente',
                'ibge': '4106902',
                'logradouro': 'Rua Importada',
                'bairro': 'Centro',
            }
        ]
        with patch('apps.persons.views.read_excel_file', return_value=mock_data):
            response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_201_CREATED

    def test_superadmin_create_person_for_other_company(self):
        other_company = Company.objects.create(
            name='Other', cnpj=self._cnpj_gen.generate()
        )
        superadmin = User.objects.create_superuser(
            username='super4@test.com',
            email='super4@test.com',
            password='password123',
        )
        self.client.force_authenticate(user=superadmin)
        url = reverse('person-list')
        data = {
            'company_id': other_company.id,
            'name': 'P2',
            'document': self._cnpj_gen.generate(),
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert Person.objects.get(name='P2').company == other_company

    def test_create_person_upserts_when_document_formatted_differently(self):
        RolePermission.objects.filter(
            role=self.role, module=Role.Module.PERSONS
        ).update(can_edit=True)
        raw = self._cnpj_gen.generate()
        person = Person.objects.create(
            company=self.company, name='Original', document=raw
        )
        masked = f'{raw[:2]}.{raw[2:5]}.{raw[5:8]}/{raw[8:12]}-{raw[12:]}'

        url = reverse('person-list')
        response = self.client.post(url, {'name': 'Atualizado', 'document': masked})
        assert response.status_code == status.HTTP_200_OK
        person.refresh_from_db()
        assert person.name == 'Atualizado'
        assert person.document == raw
        assert Person.objects.filter(company=self.company, document=raw).count() == 1

    def test_update_person_redirects_to_document_owner(self):
        RolePermission.objects.filter(
            role=self.role, module=Role.Module.PERSONS
        ).update(can_edit=True)
        owner_doc = self._cnpj_gen.generate()
        owner = Person.objects.create(
            company=self.company, name='Dono do documento', document=owner_doc
        )
        stale = Person.objects.create(
            company=self.company,
            name='Cadastro obsoleto',
            document=self._cnpj_gen.generate(),
        )

        url = reverse('person-detail', kwargs={'pk': stale.id})
        response = self.client.patch(
            url, {'name': 'Novos dados', 'document': owner_doc}
        )
        assert response.status_code == status.HTTP_200_OK
        owner.refresh_from_db()
        assert owner.name == 'Novos dados'
        stale.refresh_from_db()
        assert stale.name == 'Cadastro obsoleto'

    def test_superadmin_update_person_other_company(self):
        other_company = Company.objects.create(
            name='Other', cnpj=self._cnpj_gen.generate()
        )
        person = Person.objects.create(
            company=other_company,
            name='P',
            document=self._cnpj_gen.generate(),
        )
        superadmin = User.objects.create_superuser(
            username='super5@test.com',
            email='super5@test.com',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=superadmin)
        url = reverse('person-detail', kwargs={'pk': person.id})
        response = self.client.patch(url, {'name': 'Updated'})
        assert response.status_code == status.HTTP_200_OK
        person.refresh_from_db()
        assert person.name == 'Updated'
