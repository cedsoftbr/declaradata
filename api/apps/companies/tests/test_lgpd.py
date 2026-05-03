from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from validate_docbr import CNPJ

from apps.companies.models import Company
from apps.persons.models import Person
from apps.shipments.models import Shipment
from apps.users.models import User


class LGPDExportTests(APITestCase):
    def setUp(self):
        cnpj = CNPJ()
        self.company = Company.objects.create(name='Empresa X', cnpj=cnpj.generate())
        self.superadmin = User.objects.create_superuser(
            email='super@test.com', password='pass'
        )
        self.admin = User.objects.create_user(
            email='admin@test.com',
            password='pass',
            company=self.company,
            profile=User.Profile.ADMIN,
        )
        self.person = Person.objects.create(
            company=self.company, name='Fulano', document=cnpj.generate()
        )

    def test_export_returns_company_data(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('company-lgpd-export', kwargs={'pk': self.company.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['company']['cnpj'] == self.company.cnpj
        assert any(u['email'] == 'admin@test.com' for u in response.data['users'])
        assert any(p['name'] == 'Fulano' for p in response.data['persons'])

    def test_export_forbidden_for_non_superadmin(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('company-lgpd-export', kwargs={'pk': self.company.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_export_other_company_returns_404(self):
        other = Company.objects.create(name='Outra', cnpj=CNPJ().generate())
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('company-lgpd-export', kwargs={'pk': other.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['company']['cnpj'] == other.cnpj


class LGPDDeleteUserTests(APITestCase):
    def setUp(self):
        cnpj = CNPJ()
        self.company = Company.objects.create(name='Empresa Y', cnpj=cnpj.generate())
        self.superadmin = User.objects.create_superuser(
            email='super2@test.com', password='pass'
        )
        self.user = User.objects.create_user(
            email='usuario@test.com',
            password='pass',
            company=self.company,
            profile=User.Profile.EMISSOR,
        )

    def _url(self):
        return reverse(
            'company-lgpd-delete-user',
            kwargs={'pk': self.company.pk, 'user_id': self.user.pk},
        )

    def test_delete_user_anonymizes_and_deactivates(self):
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.delete(self._url())
        assert response.status_code == status.HTTP_204_NO_CONTENT

        self.user.refresh_from_db()
        assert not self.user.is_active
        assert 'anonimizado-' in self.user.email
        assert self.user.first_name == 'DADO'
        assert self.user.last_name == 'REMOVIDO'
        assert not self.user.has_usable_password()

    def test_delete_user_increments_session_version(self):
        original_sv = self.user.session_version
        self.client.force_authenticate(user=self.superadmin)
        self.client.delete(self._url())
        self.user.refresh_from_db()
        assert self.user.session_version == original_sv + 1

    def test_delete_user_forbidden_for_non_superadmin(self):
        admin = User.objects.create_user(
            email='admin2@test.com',
            company=self.company,
            profile=User.Profile.ADMIN,
        )
        self.client.force_authenticate(user=admin)
        response = self.client.delete(self._url())
        assert response.status_code == status.HTTP_403_FORBIDDEN


class LGPDDeletePersonTests(APITestCase):
    def setUp(self):
        cnpj = CNPJ()
        self._cnpj = cnpj
        self.company = Company.objects.create(name='Empresa Z', cnpj=cnpj.generate())
        self.superadmin = User.objects.create_superuser(
            email='super3@test.com', password='pass'
        )

    def _url(self, person):
        return reverse(
            'company-lgpd-delete-person',
            kwargs={'pk': self.company.pk, 'person_id': person.pk},
        )

    def test_delete_person_without_shipments_hard_deletes(self):
        person = Person.objects.create(
            company=self.company, name='Sem DC-e', document=self._cnpj.generate()
        )
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.delete(self._url(person))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Person.objects.filter(pk=person.pk).exists()

    def test_delete_person_with_shipments_anonymizes(self):
        person = Person.objects.create(
            company=self.company, name='Com DC-e', document=self._cnpj.generate()
        )
        emitter = Person.objects.create(
            company=self.company,
            name='Emitente',
            document=self._cnpj.generate(),
            is_emitente=True,
        )
        Shipment.objects.create(
            company=self.company,
            emitter=emitter,
            recipient=person,
            status=Shipment.Status.AUTHORIZED,
            number=1,
            transport_mode=Shipment.TransportMode.RODOVIARIO,
        )

        self.client.force_authenticate(user=self.superadmin)
        response = self.client.delete(self._url(person))
        assert response.status_code == status.HTTP_200_OK

        person.refresh_from_db()
        assert person.name == 'DADO REMOVIDO'
        assert 'ANONIMIZADO' in person.document
        assert not person.is_active

    def test_delete_person_with_shipments_preserves_shipment(self):
        person = Person.objects.create(
            company=self.company, name='Remetente', document=self._cnpj.generate()
        )
        emitter = Person.objects.create(
            company=self.company,
            name='Emitente2',
            document=self._cnpj.generate(),
            is_emitente=True,
        )
        shipment = Shipment.objects.create(
            company=self.company,
            emitter=emitter,
            recipient=person,
            status=Shipment.Status.AUTHORIZED,
            number=2,
            transport_mode=Shipment.TransportMode.RODOVIARIO,
        )

        self.client.force_authenticate(user=self.superadmin)
        self.client.delete(self._url(person))

        shipment.refresh_from_db()
        assert shipment.recipient_id == person.pk

    def test_delete_person_forbidden_for_non_superadmin(self):
        person = Person.objects.create(
            company=self.company, name='Bloqueado', document=self._cnpj.generate()
        )
        admin = User.objects.create_user(
            email='admin3@test.com',
            company=self.company,
            profile=User.Profile.ADMIN,
        )
        self.client.force_authenticate(user=admin)
        response = self.client.delete(self._url(person))
        assert response.status_code == status.HTTP_403_FORBIDDEN
