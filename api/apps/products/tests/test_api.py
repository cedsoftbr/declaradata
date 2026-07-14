from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.products.models import Product
from apps.users.models import Role, RolePermission, User


class ProductTenantTests(APITestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name='Empresa A', cnpj='11111111111111')
        self.company2 = Company.objects.create(name='Empresa B', cnpj='22222222222222')

        self.role1 = Role.objects.create(company=self.company1, name='Role A')
        # Grant permissions
        RolePermission.objects.create(
            role=self.role1, module=Role.Module.PRODUCTS, can_view=True, can_create=True
        )

        self.user1 = User.objects.create_user(
            username='user1@test.com',
            email='user1@test.com',
            password='password123',
            company=self.company1,
            role=self.role1,
        )

        self.user2 = User.objects.create_user(
            username='user2@test.com',
            email='user2@test.com',
            password='password123',
            company=self.company2,
        )

        self.superadmin = User.objects.create_superuser(
            username='admin@test.com', email='admin@test.com', password='admin123'
        )

        self.product1 = Product.objects.create(
            company=self.company1, descricao='Produto 1', ncm='12345678'
        )
        self.product2 = Product.objects.create(
            company=self.company2, descricao='Produto 2', ncm='87654321'
        )

    def test_user_can_only_see_their_own_products(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list')
        response = self.client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
        assert response.data['results'][0]['descricao'] == 'Produto 1'

    def test_superadmin_can_see_all_products(self):
        expected_count = 2
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('product-list')
        response = self.client.get(url)

        assert response.status_code == status.HTTP_200_OK
        # Should see both products
        assert response.data['count'] == expected_count

    def test_superadmin_create_product(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('product-list')
        data = {
            'company_id': self.company1.id,
            'descricao': 'Super Product',
            'ncm': '11111111',
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert Product.objects.get(descricao='Super Product').company == self.company1

    def test_update_product(self):
        # Grant edit permission
        RolePermission.objects.filter(
            role=self.role1, module=Role.Module.PRODUCTS
        ).update(can_edit=True)
        self.client.force_authenticate(user=self.user1)

        url = reverse('product-detail', kwargs={'pk': self.product1.id})
        response = self.client.patch(url, {'descricao': 'Updated Product'})
        assert response.status_code == status.HTTP_200_OK
        self.product1.refresh_from_db()
        assert self.product1.descricao == 'Updated Product'

    def test_create_product_with_unit_value(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list')
        data = {
            'descricao': 'Produto com preço',
            'ncm': '22222222',
            'unit_value': '19.90',
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        product = Product.objects.get(descricao='Produto com preço')
        assert product.unit_value == Decimal('19.9000')

    def test_create_product_without_unit_value(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list')
        data = {'descricao': 'Produto sem preço', 'ncm': '33333333'}
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        product = Product.objects.get(descricao='Produto sem preço')
        assert product.unit_value is None

    def test_delete_product(self):
        # Grant delete permission
        RolePermission.objects.filter(
            role=self.role1, module=Role.Module.PRODUCTS
        ).update(can_delete=True)
        self.client.force_authenticate(user=self.user1)

        url = reverse('product-detail', kwargs={'pk': self.product1.id})
        response = self.client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Product.objects.filter(id=self.product1.id).exists()

    def test_import_excel_products_no_file(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list') + 'import-excel/'
        response = self.client.post(url, {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_import_excel_products_success(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list') + 'import-excel/'
        excel_file = SimpleUploadedFile('products.xlsx', b'fake data')
        mock_data = [{'descricao': 'Imported Product', 'ncm': '99999999'}]
        with patch('apps.products.views.read_excel_file', return_value=mock_data):
            response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_201_CREATED
        assert Product.objects.filter(
            descricao='Imported Product', company=self.company1
        ).exists()

    def test_superadmin_create_product_for_other_company(self):
        other_company = Company.objects.create(name='Other', cnpj='2')
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('product-list')
        data = {
            'company_id': other_company.id,
            'descricao': 'P2',
            'ncm': '1',
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert Product.objects.get(descricao='P2').company == other_company

    def test_update_product_not_allowed_for_other_company(self):
        other_company = Company.objects.create(name='Other', cnpj='3')
        other_product = Product.objects.create(
            company=other_company, descricao='Other', ncm='1'
        )
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-detail', kwargs={'pk': other_product.id})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_import_excel_products_superadmin_no_company_id(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('product-list') + 'import-excel/'
        excel_file = SimpleUploadedFile('p.xlsx', b'd')
        response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'informar company_id' in str(response.data)

    def test_import_excel_products_user_no_company(self):
        user = User.objects.create_user(
            username='noco2@test.com', email='noco2@test.com'
        )
        role = Role.objects.create(name='R')
        RolePermission.objects.create(
            role=role, module=Role.Module.PRODUCTS, can_create=True
        )
        user.role = role
        user.save()
        self.client.force_authenticate(user=user)
        url = reverse('product-list') + 'import-excel/'
        excel_file = SimpleUploadedFile('p.xlsx', b'd')
        response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'vinculado a uma empresa' in str(response.data)

    def test_import_excel_products_missing_descricao(self):
        self.client.force_authenticate(user=self.user1)
        url = reverse('product-list') + 'import-excel/'
        excel_file = SimpleUploadedFile('products.xlsx', b'fake data')
        mock_data = [{'descricao': '', 'ncm': '1'}]
        with patch('apps.products.views.read_excel_file', return_value=mock_data):
            response = self.client.post(url, {'file': excel_file}, format='multipart')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['created'] == 0
