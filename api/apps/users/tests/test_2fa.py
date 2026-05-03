from unittest.mock import patch

from django.core.cache import cache
from django.core.signing import TimestampSigner
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User

LOCMEM_CACHE = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}


def _make_session_token(user_id):
    signer = TimestampSigner(salt='2fa-session')
    return signer.sign(str(user_id))


class TwoFALoginTests(APITestCase):
    def setUp(self):
        self.url = reverse('auth_login')
        self.user = User.objects.create_user(
            email='user@test.com', password='senha123', twofa_enabled=True
        )

    def test_login_without_2fa_returns_jwt(self):
        self.user.twofa_enabled = False
        self.user.save(update_fields=['twofa_enabled'])
        response = self.client.post(
            self.url, {'email': 'user@test.com', 'password': 'senha123'}
        )
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data

    def test_login_with_2fa_returns_session_token(self):
        with patch('apps.users.serializers.send_2fa_pin_email') as mock_send:
            response = self.client.post(
                self.url, {'email': 'user@test.com', 'password': 'senha123'}
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('requires_2fa') is True
        assert 'session_token' in response.data
        assert 'access' not in response.data
        mock_send.assert_called_once()

    @override_settings(CACHES=LOCMEM_CACHE)
    def test_login_with_2fa_stores_pin_in_cache(self):
        with patch('apps.users.serializers.send_2fa_pin_email'):
            self.client.post(
                self.url, {'email': 'user@test.com', 'password': 'senha123'}
            )
        data = cache.get(f'2fa:{self.user.pk}')
        assert data is not None
        assert 'pin' in data
        assert data['attempts'] == 0
        assert len(data['pin']) == 6


@override_settings(CACHES=LOCMEM_CACHE)
class TwoFAVerifyTests(APITestCase):
    def setUp(self):
        self.url = reverse('auth_2fa_verify')
        self.user = User.objects.create_user(
            email='verify@test.com', password='senha123', twofa_enabled=True
        )
        self.pin = '123456'
        cache.set(f'2fa:{self.user.pk}', {'pin': self.pin, 'attempts': 0}, timeout=600)
        self.session_token = _make_session_token(self.user.pk)

    def tearDown(self):
        cache.delete(f'2fa:{self.user.pk}')

    def test_correct_pin_returns_jwt(self):
        response = self.client.post(
            self.url, {'session_token': self.session_token, 'pin': self.pin}
        )
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data

    def test_correct_pin_increments_session_version(self):
        original = self.user.session_version
        self.client.post(
            self.url, {'session_token': self.session_token, 'pin': self.pin}
        )
        self.user.refresh_from_db()
        assert self.user.session_version == original + 1

    def test_correct_pin_clears_cache(self):
        self.client.post(
            self.url, {'session_token': self.session_token, 'pin': self.pin}
        )
        assert cache.get(f'2fa:{self.user.pk}') is None

    def test_wrong_pin_returns_401(self):
        response = self.client.post(
            self.url, {'session_token': self.session_token, 'pin': '000000'}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_wrong_pin_increments_attempts(self):
        self.client.post(
            self.url, {'session_token': self.session_token, 'pin': '000000'}
        )
        data = cache.get(f'2fa:{self.user.pk}')
        assert data['attempts'] == 1

    def test_five_wrong_pins_clears_cache(self):
        cache.set(
            f'2fa:{self.user.pk}',
            {'pin': self.pin, 'attempts': 5},
            timeout=600,
        )
        response = self.client.post(
            self.url, {'session_token': self.session_token, 'pin': '000000'}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert cache.get(f'2fa:{self.user.pk}') is None

    def test_expired_pin_returns_401(self):
        cache.delete(f'2fa:{self.user.pk}')
        response = self.client.post(
            self.url, {'session_token': self.session_token, 'pin': self.pin}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_invalid_session_token_returns_401(self):
        response = self.client.post(
            self.url, {'session_token': 'token-invalido', 'pin': self.pin}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_inactive_user_returns_404(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        response = self.client.post(
            self.url, {'session_token': self.session_token, 'pin': self.pin}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TwoFAToggleTests(APITestCase):
    def setUp(self):
        self.url = reverse('users_me')

    def _create_and_auth(self, profile):
        user = User.objects.create_user(
            email=f'{profile}@test.com', password='pass', profile=profile
        )
        self.client.force_authenticate(user=user)
        return user

    def test_admin_can_enable_2fa(self):
        self._create_and_auth(User.Profile.ADMIN)
        response = self.client.patch(self.url, {'twofa_enabled': True})
        assert response.status_code == status.HTTP_200_OK

    def test_emissor_can_enable_2fa(self):
        self._create_and_auth(User.Profile.EMISSOR)
        response = self.client.patch(self.url, {'twofa_enabled': True})
        assert response.status_code == status.HTTP_200_OK

    def test_superadmin_can_enable_2fa(self):
        user = User.objects.create_superuser(email='sa@test.com', password='pass')
        self.client.force_authenticate(user=user)
        response = self.client.patch(self.url, {'twofa_enabled': True})
        assert response.status_code == status.HTTP_200_OK

    def test_viewer_cannot_enable_2fa(self):
        self._create_and_auth(User.Profile.VIEWER)
        response = self.client.patch(self.url, {'twofa_enabled': True})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
