from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.locations.models import City
from apps.persons.models import Person, PersonAddress
from apps.users.models import Role, RolePermission, User


class AddressLogicTests(APITestCase):
    def setUp(self):
        self.city = City.objects.create(name='Curitiba', uf='PR', ibge_code='4106902')
        self.company = Company.objects.create(name='Test Co', cnpj='12345678000199')
        self.role = Role.objects.create(company=self.company, name='Gestor')
        RolePermission.objects.create(
            role=self.role,
            module=Role.Module.PERSONS,
            can_view=True,
            can_create=True,
            can_edit=True,
        )
        self.user = User.objects.create_user(
            username='gestor@test.com',
            email='gestor@test.com',
            password='password123',
            company=self.company,
            role=self.role,
        )
        self.client.force_authenticate(user=self.user)
        self.person = Person.objects.create(
            company=self.company,
            name='Test Person',
            document='12345678901',
        )
        self.address_data = {
            'label': 'Principal',
            'zip_code': '80000-000',
            'address': 'Rua Teste',
            'number': '123',
            'neighborhood': 'Centro',
            'city_id': str(self.city.id),
            'contact_phone': '4199999999',
            'contact_email': 'test@test.com',
        }

    def test_create_address_first_time(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        response = self.client.post(url, self.address_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert PersonAddress.objects.filter(person=self.person).count() == 1
        assert response.data['is_default'] is True

    def test_reuse_identical_address(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        # First creation
        res1 = self.client.post(url, self.address_data)
        id1 = res1.data['id']

        # Second creation with identical data
        res2 = self.client.post(url, self.address_data)
        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.data['id'] == id1
        assert PersonAddress.objects.filter(person=self.person).count() == 1

    def test_create_new_on_change(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        # First creation
        res1 = self.client.post(url, self.address_data)
        id1 = res1.data['id']

        # Change one field
        data2 = self.address_data.copy()
        data2['number'] = '124'
        res2 = self.client.post(url, data2)

        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.data['id'] != id1
        assert PersonAddress.objects.filter(person=self.person).count() == 2

        # Verify newest is default
        addr1 = PersonAddress.objects.get(id=id1)
        addr2 = PersonAddress.objects.get(id=res2.data['id'])
        assert addr2.is_default is True
        assert addr1.is_default is False

    def test_change_label_creates_new_address(self):
        """Verify if label change also creates a new address record."""
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        res1 = self.client.post(url, self.address_data)
        id1 = res1.data['id']

        data2 = self.address_data.copy()
        data2['label'] = 'Trabalho'
        res2 = self.client.post(url, data2)

        # Current implementation might fail this if label is not
        # in _ADDRESS_CONTENT_FIELDS
        assert res2.data['id'] != id1, 'Label change should create a new address record'

    def test_change_contact_email_creates_new_address(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        res1 = self.client.post(url, self.address_data)
        id1 = res1.data['id']

        data2 = self.address_data.copy()
        data2['contact_email'] = 'novo-email@test.com'
        res2 = self.client.post(url, data2)

        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.data['id'] != id1
        assert PersonAddress.objects.filter(person=self.person).count() == 2

    def test_missing_optional_contact_email_reuses_current_address(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        res1 = self.client.post(url, self.address_data)
        id1 = res1.data['id']

        data2 = self.address_data.copy()
        del data2['contact_email']
        res2 = self.client.post(url, data2)

        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.data['id'] == id1
        assert PersonAddress.objects.filter(person=self.person).count() == 1

    def test_direct_patch_address_fails_for_content(self):
        url_create = reverse('person-addresses', kwargs={'pk': self.person.id})
        res1 = self.client.post(url_create, self.address_data)
        id1 = res1.data['id']

        url_detail = reverse('person-address-detail', kwargs={'pk': id1})
        # This should fail or be blocked if we want strictly no in-line updates
        response = self.client.patch(url_detail, {'number': '999'})
        # Current implementation returns 405 because PATCH is not in ViewSet
        assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_revert_to_old_address_creates_new_record_preserving_history(self):
        url = reverse('person-addresses', kwargs={'pk': self.person.id})
        # Create Addr A
        resA = self.client.post(url, self.address_data)
        idA = resA.data['id']

        # Create Addr B
        dataB = self.address_data.copy()
        dataB['address'] = 'Rua B'
        resB = self.client.post(url, dataB)
        idB = resB.data['id']

        # Go back to Addr A data
        resA2 = self.client.post(url, self.address_data)
        idA2 = resA2.data['id']

        assert idA2 != idB
        # If we want pure timeline, idA2 should also be != idA
        assert idA2 != idA
        assert PersonAddress.objects.filter(person=self.person).count() == 3
