import uuid
from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.billing.models import Plan
from apps.companies.models import Company
from apps.users.models import Role, User, UserConsentAudit


class UserAPITests(APITestCase):  # noqa: PLR0904
    def setUp(self):
        self.company = Company.objects.create(
            name='Test Company', cnpj='12.345.678/0001-90'
        )
        self.superadmin = User.objects.create_superuser(
            email='admin@test.com', password='password123'
        )
        self.manager_role = Role.objects.create(
            company=self.company, name='Manager', can_manage_users=True
        )
        self.manager = User.objects.create_user(
            email='manager@test.com',
            password='password123',
            company=self.company,
            role=self.manager_role,
            can_manage_users=True,
            profile=User.Profile.ADMIN,
        )

    def test_login_success(self):
        url = reverse('auth_login')
        data = {'email': 'manager@test.com', 'password': 'password123'}
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data
        assert response.data['refresh']

    def test_login_fail(self):
        url = reverse('auth_login')
        data = {'email': 'manager@test.com', 'password': 'wrongpassword'}
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_me(self):
        self.client.force_authenticate(user=self.manager)
        url = reverse('users_me')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == 'manager@test.com'
        assert response.data['can_manage_users'] is True

    def test_patch_me_accept_terms_and_privacy(self):
        self.client.force_authenticate(user=self.manager)
        url = reverse('users_me')
        response = self.client.patch(
            url,
            {
                'accept_terms': True,
                'accept_privacy': True,
            },
            format='json',
            HTTP_X_FORWARDED_FOR='203.0.113.9',
            HTTP_USER_AGENT='LGPD-Audit-Test/1.0',
        )
        assert response.status_code == status.HTTP_200_OK
        self.manager.refresh_from_db()
        assert self.manager.terms_accepted_at is not None
        assert self.manager.privacy_policy_accepted_at is not None
        assert self.manager.legal_terms_version
        audit = UserConsentAudit.objects.filter(user=self.manager).first()
        assert audit is not None
        assert audit.accepted_terms is True
        assert audit.accepted_privacy is True
        assert audit.ip_address == '203.0.113.9'
        assert audit.user_agent == 'LGPD-Audit-Test/1.0'

    def test_role_crud(self):
        self.client.force_authenticate(user=self.manager)
        # List
        url = reverse('role-list')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK

        # Create
        data = {
            'name': 'New Role',
            'company_id': self.company.id,
            'permissions': [
                {'module': 'products', 'can_view': True, 'can_create': True}
            ],
        }
        response = self.client.post(url, data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        role_id = response.data['id']

        # Update
        url_detail = reverse('role-detail', kwargs={'pk': role_id})
        data['name'] = 'Updated Role'
        response = self.client.put(url_detail, data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Role'

        # Delete
        response = self.client.delete(url_detail)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_superadmin_user_crud(self):
        self.client.force_authenticate(user=self.superadmin)
        url = reverse('user-list')

        # Create user
        unique_email = f'staff_{uuid.uuid4()}@test.com'
        data = {
            'email': unique_email,
            'is_staff': True,
            'company_id': self.company.id,
            'profile': User.Profile.EMISSOR,
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['is_staff'] is True

        # Update user
        user_id = response.data['id']
        url_detail = reverse('user-detail', kwargs={'pk': user_id})
        # Re-send company_id to satisfy profile validation for Admin/Emissor
        response = self.client.patch(
            url_detail, {'is_active': False, 'company_id': self.company.id}
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_active'] is False

    def test_user_management_by_manager(self):
        self.client.force_authenticate(user=self.manager)
        url = reverse('user-list')

        # Create user in same company
        data = {
            'email': 'newuser@test.com',
            'first_name': 'New',
            'last_name': 'User',
            'role_id': self.manager_role.id,
        }
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        new_user_id = response.data['id']

        # Update user
        url_detail = reverse('user-detail', kwargs={'pk': new_user_id})
        response = self.client.patch(url_detail, {'first_name': 'Changed'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['first_name'] == 'Changed'

    def test_manager_cannot_create_superadmin(self):
        self.client.force_authenticate(user=self.manager)
        url = reverse('user-list')
        data = {'email': 'hacker@test.com', 'is_staff': True, 'is_superuser': True}
        response = self.client.post(url, data)
        # Should create but is_staff should be ignored/false
        assert response.status_code == status.HTTP_201_CREATED
        user = User.objects.get(email='hacker@test.com')
        assert user.is_staff is False
        assert user.is_superuser is False

    def test_user_limit_blocks_create_active_admin_or_emissor(self):
        plan = Plan.objects.create(
            name='Limite 1', monthly_dce_limit=100, active_user_limit=1, price='0.00'
        )
        self.company.plan = plan
        self.company.save(update_fields=['plan'])

        self.client.force_authenticate(user=self.manager)
        url = reverse('user-list')
        response = self.client.post(
            url,
            {
                'email': 'blocked-user@test.com',
                'profile': User.Profile.EMISSOR,
                'company_id': str(self.company.id),
                'is_active': True,
            },
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'company_id' in response.data

    def test_user_limit_blocks_promote_to_emissor_when_company_is_full(self):
        plan = Plan.objects.create(
            name='Limite 2', monthly_dce_limit=100, active_user_limit=1, price='0.00'
        )
        self.company.plan = plan
        self.company.save(update_fields=['plan'])

        viewer = User.objects.create_user(
            email='viewer-limit@test.com',
            company=self.company,
            profile=User.Profile.VIEWER,
            is_active=True,
        )

        self.client.force_authenticate(user=self.manager)
        url = reverse('user-detail', kwargs={'pk': viewer.id})
        response = self.client.patch(
            url,
            {'profile': User.Profile.EMISSOR, 'is_active': True},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'company_id' in response.data

    def test_login_disabled_account(self):
        self.manager.is_active = False
        self.manager.save()
        url = reverse('auth_login')
        data = {'email': 'manager@test.com', 'password': 'password123'}
        response = self.client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Default backend returns None for inactive users, so we get the generic error
        assert 'E-mail não encontrado ou senha inválida' in str(response.data)

    def test_login_blocked_when_company_is_inactive(self):
        self.company.is_active = False
        self.company.save(update_fields=['is_active'])

        url = reverse('auth_login')
        data = {'email': 'manager@test.com', 'password': 'password123'}
        response = self.client.post(url, data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Empresa inativa. Acesso bloqueado.' in str(response.data)

    def test_login_superadmin_not_blocked_by_inactive_company(self):
        self.company.is_active = False
        self.company.save(update_fields=['is_active'])

        url = reverse('auth_login')
        data = {'email': 'admin@test.com', 'password': 'password123'}
        response = self.client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data.get('access')
        assert response.data.get('refresh')

    def test_refresh_token_from_old_login_is_invalid_after_new_login(self):
        login_url = reverse('auth_login')
        refresh_url = reverse('auth_token_refresh')

        first = self.client.post(
            login_url,
            {'email': 'manager@test.com', 'password': 'password123'},
        )
        assert first.status_code == status.HTTP_200_OK
        refresh_1 = first.data.get('refresh')
        assert refresh_1

        second = self.client.post(
            login_url,
            {'email': 'manager@test.com', 'password': 'password123'},
        )
        assert second.status_code == status.HTTP_200_OK
        refresh_2 = second.data.get('refresh')
        assert refresh_2
        assert refresh_2 != refresh_1

        old_refresh_response = self.client.post(
            refresh_url,
            {'refresh': refresh_1},
            format='json',
        )
        assert old_refresh_response.status_code in {
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED,
        }

    def test_role_update_without_permissions(self):
        self.client.force_authenticate(user=self.manager)
        url = reverse('role-detail', kwargs={'pk': self.manager_role.pk})
        # PATCH without permissions field
        response = self.client.patch(url, {'name': 'Patched Role'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Patched Role'

    def test_get_me_no_role(self):
        # Use VIEWER profile to avoid automatic full permissions from ADMIN/EMISSOR
        user_no_role = User.objects.create_user(
            email='norole@test.com',
            password='password123',
            company=self.company,
            role=None,
            profile=User.Profile.VIEWER,
        )
        self.client.force_authenticate(user=user_no_role)
        url = reverse('users_me')
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # VIEWER has only can_view
        assert response.data['permissions']['products']['can_view'] is True
        assert response.data['permissions']['products']['can_create'] is False

    def test_manager_access_other_user(self):
        other_company = Company.objects.create(name='Other', cnpj='99.999.999/0001-88')
        other_user = User.objects.create_user(
            email='other@test.com', company=other_company
        )
        self.client.force_authenticate(user=self.manager)
        url = reverse('user-detail', kwargs={'pk': other_user.pk})
        response = self.client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_user_without_module_permission_denied(self):
        # Use VIEWER profile which only has can_view.
        # POST to products should be denied.
        low_user = User.objects.create_user(
            email='low@test.com',
            company=self.company,
            role=None,
            profile=User.Profile.VIEWER,
        )
        self.client.force_authenticate(user=low_user)
        url = reverse('product-list')
        # GET is allowed for VIEWER
        response = self.client.get(url)
        assert response.status_code == status.HTTP_200_OK

        # POST is NOT allowed for VIEWER
        response = self.client.post(url, {'descricao': 'X', 'ncm': '1'})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_role_create_invalid_company(self):
        other_company = Company.objects.create(name='Other', cnpj='2')
        self.client.force_authenticate(user=self.manager)
        url = reverse('role-list')
        data = {'name': 'X', 'company_id': other_company.id, 'permissions': []}
        response = self.client.post(url, data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'company_id' in response.data

    def test_manager_cannot_move_role_to_other_company(self):
        other_company = Company.objects.create(name='Other 2', cnpj='3')
        self.client.force_authenticate(user=self.manager)
        url = reverse('role-detail', kwargs={'pk': self.manager_role.pk})
        response = self.client.patch(
            url,
            {'company_id': str(other_company.id)},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'company_id' in response.data

    def test_resend_invite(self):
        user = User.objects.create_user(email='invite@test.com', company=self.company)
        self.client.force_authenticate(user=self.manager)
        url = reverse('user-resend-invite', kwargs={'pk': user.pk})
        # Mocking email sending to avoid actual SMTP calls
        with patch('apps.users.views.send_welcome_email') as mock_email:
            response = self.client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert mock_email.called


class SessionAwareAuthTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name='Session Co', cnpj='11.111.111/0001-11'
        )
        self.user = User.objects.create_user(
            email='session@test.com',
            password='password123',
            company=self.company,
        )
        self.login_url = reverse('auth_login')
        self.refresh_url = reverse('auth_token_refresh')
        self.me_url = reverse('users_me')

    def _login(self):
        res = self.client.post(
            self.login_url,
            {'email': 'session@test.com', 'password': 'password123'},
        )
        assert res.status_code == status.HTTP_200_OK
        return res.data['access'], res.data['refresh']

    def test_login_increments_session_version(self):
        self._login()
        self.user.refresh_from_db()
        v1 = self.user.session_version

        self._login()
        self.user.refresh_from_db()
        v2 = self.user.session_version

        assert v2 == v1 + 1

    def test_login_token_contains_sv_claim(self):
        access, _ = self._login()
        self.user.refresh_from_db()
        token = AccessToken(access)
        assert token['sv'] == int(self.user.session_version)

    def test_access_token_from_old_session_rejected(self):
        access_1, _ = self._login()
        # Second login increments session_version — access_1 is now stale
        self._login()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_1}')
        response = self.client.get(self.me_url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_access_token_from_current_session_accepted(self):
        access, _ = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        response = self.client.get(self.me_url)
        assert response.status_code == status.HTTP_200_OK

    def test_refresh_token_from_old_session_rejected(self):
        _, refresh_1 = self._login()
        # Second login makes refresh_1 stale (session_version mismatch)
        self._login()

        response = self.client.post(
            self.refresh_url, {'refresh': refresh_1}, format='json'
        )
        assert response.status_code in {
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED,
        }

    def test_refresh_token_from_current_session_succeeds(self):
        _, refresh = self._login()
        response = self.client.post(
            self.refresh_url, {'refresh': refresh}, format='json'
        )
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
