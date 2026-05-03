from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.locations.models import City
from apps.users.models import User


class LocationTests(APITestCase):
    def setUp(self):
        self.city = City.objects.create(name='Curitiba', uf='PR', ibge_code='4106902')
        self.superadmin = User.objects.create_superuser(
            username='super@test.com', email='super@test.com', password='password123'
        )
        self.client.force_authenticate(user=self.superadmin)

    def test_list_cities(self):
        url = reverse('city-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # The response is paginated
        assert response.data['count'] == 1
        assert response.data['results'][0]['name'] == 'Curitiba'

    def test_city_str(self):
        assert str(self.city) == 'Curitiba - PR'

    def test_import_excel_success(self):
        url = reverse('city-list') + 'import-excel/'
        # Simulate an Excel file
        file_content = b'test content'
        excel_file = SimpleUploadedFile(
            'cities.xlsx',
            file_content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

        mock_data = [
            {'cidade': 'São Paulo', 'uf': 'SP', 'ibge': '3550308'},
            {'cidade': 'Rio de Janeiro', 'uf': 'RJ', 'ibge': '3304557'},
        ]

        with patch('apps.locations.views.read_excel_file', return_value=mock_data):
            response = self.client.post(url, {'file': excel_file}, format='multipart')

        assert response.status_code == status.HTTP_201_CREATED
        assert City.objects.filter(ibge_code='3550308').exists()
        assert City.objects.filter(ibge_code='3304557').exists()

    def test_import_excel_denied_for_non_superadmin(self):
        # Create a non-superadmin user
        user = User.objects.create_user(
            username='user@test.com', email='user@test.com', password='password123'
        )
        self.client.force_authenticate(user=user)

        url = reverse('city-list') + 'import-excel/'
        response = self.client.post(url, {'file': 'dummy'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
