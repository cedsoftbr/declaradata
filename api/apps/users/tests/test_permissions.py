from rest_framework.test import APITestCase

from apps.companies.models import Company
from apps.users.models import Role, RolePermission, User
from apps.users.permissions import HasModulePermission, IsSuperAdmin


class UserPermissionTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name='Test Company',
            cnpj='12.345.678/0001-90',
        )

        # SuperAdmin
        self.superadmin = User.objects.create_superuser(
            username='admin@test.com', email='admin@test.com', password='password123'
        )

        # Company Manager
        self.manager_role = Role.objects.create(
            company=self.company,
            name='Manager',
        )
        self.manager = User.objects.create_user(
            username='manager@test.com',
            email='manager@test.com',
            password='password123',
            company=self.company,
            role=self.manager_role,
            can_manage_users=True,
        )

        # Regular User
        self.user_role = Role.objects.create(
            company=self.company, name='User', can_manage_users=False
        )
        self.user = User.objects.create_user(
            username='user@test.com',
            email='user@test.com',
            password='password123',
            company=self.company,
            role=self.user_role,
        )

        # Module permission for products
        RolePermission.objects.create(
            role=self.user_role,
            module=Role.Module.PRODUCTS,
            can_view=True,
            can_create=False,
        )

    def test_user_properties(self):
        assert self.superadmin.is_superadmin
        assert self.manager.can_manage_users
        assert not self.user.can_manage_users
        assert not self.user.is_superadmin

    def test_is_superadmin_permission(self):
        permission = IsSuperAdmin()

        # Mock request
        class Request:
            def __init__(self, user):
                self.user = user

        assert permission.has_permission(Request(self.superadmin), None)
        assert not permission.has_permission(Request(self.manager), None)
        assert not permission.has_permission(Request(self.user), None)

    def test_has_module_permission(self):
        permission = HasModulePermission()

        class MockView:
            module_name = Role.Module.PRODUCTS
            action = 'list'

        class Request:
            def __init__(self, user):
                self.user = user

        view = MockView()

        # User with EMISSOR profile (default) has full access
        assert self.user.profile == User.Profile.EMISSOR
        assert permission.has_permission(Request(self.user), view)
        view.action = 'create'
        assert permission.has_permission(Request(self.user), view)

        # User with VIEWER profile has restricted access
        self.user.profile = User.Profile.VIEWER
        self.user.save()

        view.action = 'list'
        assert permission.has_permission(Request(self.user), view)

        view.action = 'create'
        assert not permission.has_permission(Request(self.user), view)

        # Superadmin has everything
        assert permission.has_permission(Request(self.superadmin), view)
