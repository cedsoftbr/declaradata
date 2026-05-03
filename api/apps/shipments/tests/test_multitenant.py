"""
Testes de isolamento multi-tenant.

Garante que um usuário da Empresa A não pode visualizar, criar, editar ou
deletar recursos (shipments, persons, products) que pertencem à Empresa B.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.factories import (
    CompanyFactory,
    PersonFactory,
    ProductFactory,
    RoleFactory,
    RolePermissionFactory,
    ShipmentFactory,
    SuperAdminFactory,
    UserFactory,
)
from apps.shipments.models import Shipment
from apps.users.models import Role, User


def _make_user(email, company, role):
    return UserFactory(
        email=email,
        company=company,
        role=role,
        profile=User.Profile.EMISSOR,  # Garante que use permissões da role
    )


def _full_role(company, name):
    """Cria um Role com todas as permissões nos três módulos."""
    role = RoleFactory(company=company, name=name)
    for module in (Role.Module.PERSONS, Role.Module.PRODUCTS, Role.Module.DCE):
        RolePermissionFactory(
            role=role,
            module=module,
            can_view=True,
            can_create=True,
            can_edit=True,
            can_delete=True,
        )
    return role


class MultiTenantShipmentTests(APITestCase):
    """Usuário da Empresa A não acessa shipments da Empresa B."""

    def setUp(self):
        self.company_a = CompanyFactory(name='Empresa A')
        self.company_b = CompanyFactory(name='Empresa B')

        role_a = _full_role(self.company_a, 'Role A')
        role_b = _full_role(self.company_b, 'Role B')

        self.user_a = _make_user('a@test.com', self.company_a, role_a)
        self.user_b = _make_user('b@test.com', self.company_b, role_b)

        self.person_a = PersonFactory(
            company=self.company_a,
            name='Pessoa A',
            document='11122233344',
        )
        self.person_b = PersonFactory(
            company=self.company_b,
            name='Pessoa B',
            document='44433322211',
        )

        # Shipment da Empresa B
        self.shipment_b = ShipmentFactory(
            company=self.company_b,
            recipient=self.person_b,
            status=Shipment.Status.DRAFT,
        )

    # ── Listagem ──────────────────────────────────────────────────────────────

    def test_list_retorna_apenas_propria_empresa(self):
        """GET /api/shipments/ não deve expor shipments de outra empresa."""
        self.client.force_authenticate(self.user_a)
        response = self.client.get(reverse('shipment-list'))

        assert response.status_code == status.HTTP_200_OK
        ids = [s['id'] for s in response.data['results']]
        assert self.shipment_b.pk not in ids

    # ── Retrieve ──────────────────────────────────────────────────────────────

    def test_retrieve_shipment_empresa_alheia_retorna_404(self):
        """GET /api/shipments/{id}/ de outra empresa → 404."""
        self.client.force_authenticate(self.user_a)
        url = reverse('shipment-detail', kwargs={'pk': self.shipment_b.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── Update ────────────────────────────────────────────────────────────────

    def test_patch_shipment_empresa_alheia_retorna_404(self):
        """PATCH /api/shipments/{id}/ de outra empresa → 404."""
        self.client.force_authenticate(self.user_a)
        url = reverse('shipment-detail', kwargs={'pk': self.shipment_b.pk})
        response = self.client.patch(url, {'tp_amb': 1}, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── Delete ────────────────────────────────────────────────────────────────

    def test_delete_shipment_empresa_alheia_retorna_404(self):
        """DELETE /api/shipments/{id}/ de outra empresa → 404."""
        self.client.force_authenticate(self.user_a)
        url = reverse('shipment-detail', kwargs={'pk': self.shipment_b.pk})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    # ── Criação com person de outra empresa ──────────────────────────────────

    def test_create_shipment_com_recipient_empresa_alheia_rejeitado(self):
        """
        POST /api/shipments/ com recipient_id de outra empresa deve ser rejeitado.
        O serializer filtra o queryset por empresa, então o PK de pessoa alheia
        não é válido e retorna 400.
        """
        product_a = ProductFactory(company=self.company_a)
        self.client.force_authenticate(self.user_a)
        payload = {
            'recipient_id': self.person_b.pk,  # person de outra empresa
            'tp_emit': 2,
            'tp_amb': 2,
            'transport_mode': 1,
            'items': [
                {
                    'product_id': product_a.pk,
                    'x_prod': 'Item',
                    'ncm': '11111111',
                    'q_com': '1.0000',
                    'v_un_com': '10.0000',
                }
            ],
        }
        url = reverse('shipment-list')
        response = self.client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_shipment_com_produto_empresa_alheia_rejeitado(self):
        """
        POST /api/shipments/ com product_id de outra empresa deve ser rejeitado.
        """
        product_b = ProductFactory(company=self.company_b)
        emitter_a = PersonFactory(
            company=self.company_a,
            is_emitente=True,
            name='Emitente A',
            document='12345678000195',
        )
        recipient_a = PersonFactory(
            company=self.company_a,
            name='Destinatário A',
            document='12345678901',
        )

        self.client.force_authenticate(self.user_a)
        payload = {
            'emitter_id': emitter_a.pk,
            'recipient_id': recipient_a.pk,
            'tp_amb': 2,
            'transport_mode': 1,
            'items': [
                {
                    'product_id': product_b.pk,  # produto de outra empresa
                    'x_prod': 'Item',
                    'ncm': '11111111',
                    'q_com': '1.0000',
                    'v_un_com': '10.0000',
                }
            ],
        }
        url = reverse('shipment-list')
        response = self.client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class MultiTenantPersonTests(APITestCase):
    """Usuário da Empresa A não acessa persons da Empresa B."""

    def setUp(self):
        self.company_a = CompanyFactory(name='Empresa A')
        self.company_b = CompanyFactory(name='Empresa B')

        self.user_a = _make_user(
            'pa@test.com', self.company_a, _full_role(self.company_a, 'RA')
        )
        self.person_b = PersonFactory(
            company=self.company_b,
            name='Pessoa B',
            document='55566677788',
        )

    def test_list_persons_nao_expoe_empresa_alheia(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(reverse('person-list'))
        assert response.status_code == status.HTTP_200_OK
        ids = [p['id'] for p in response.data['results']]
        assert self.person_b.pk not in ids

    def test_retrieve_person_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('person-detail', kwargs={'pk': self.person_b.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_patch_person_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('person-detail', kwargs={'pk': self.person_b.pk})
        response = self.client.patch(url, {'name': 'Hack'}, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_person_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('person-detail', kwargs={'pk': self.person_b.pk})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class MultiTenantProductTests(APITestCase):
    """Usuário da Empresa A não acessa products da Empresa B."""

    def setUp(self):
        self.company_a = CompanyFactory(name='Empresa A')
        self.company_b = CompanyFactory(name='Empresa B')

        self.user_a = _make_user(
            'qa@test.com', self.company_a, _full_role(self.company_a, 'RA')
        )
        self.product_b = ProductFactory(company=self.company_b, descricao='Produto B')

    def test_list_products_nao_expoe_empresa_alheia(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(reverse('product-list'))
        assert response.status_code == status.HTTP_200_OK
        ids = [p['id'] for p in response.data['results']]
        assert self.product_b.pk not in ids

    def test_retrieve_product_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('product-detail', kwargs={'pk': self.product_b.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_patch_product_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('product-detail', kwargs={'pk': self.product_b.pk})
        response = self.client.patch(url, {'descricao': 'Hack'}, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_product_empresa_alheia_retorna_404(self):
        self.client.force_authenticate(self.user_a)
        url = reverse('product-detail', kwargs={'pk': self.product_b.pk})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class SuperAdminAcessoTotalTests(APITestCase):
    """Superadmin deve continuar acessando recursos de qualquer empresa."""

    def setUp(self):
        self.company = CompanyFactory(name='Empresa X')
        self.superadmin = SuperAdminFactory()
        self.person = PersonFactory(
            company=self.company,
            name='Pessoa X',
            document='12312312399',
        )

    def test_superadmin_acessa_person_de_qualquer_empresa(self):
        self.client.force_authenticate(self.superadmin)
        url = reverse('person-detail', kwargs={'pk': self.person.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(self.person.pk)
