from typing import ClassVar

from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """Superusuário (is_staff ou is_superuser) — acesso irrestrito."""

    def has_permission(self, request, _view):  # noqa: PLR6301
        return request.user.is_authenticated and request.user.is_superadmin


class IsCompanyManager(BasePermission):
    """
    Usuário admin da empresa.
    Pode gerenciar usuários da própria empresa.
    """

    def has_permission(self, request, _view):  # noqa: PLR6301
        return request.user.is_authenticated and request.user.is_company_admin


class IsSuperAdminOrCompanyManager(BasePermission):
    """Superadmin ou gestor de empresa."""

    def has_permission(self, request, _view):  # noqa: PLR6301
        if not request.user.is_authenticated:
            return False
        return request.user.is_superadmin or request.user.is_company_admin


class HasModulePermission(BasePermission):
    """
    Verifica permissão pelo módulo declarado no ViewSet.

    - Superadmin: acesso total.
    Perfis fixos:
    - superadmin: acesso total
    - admin: acesso total aos módulos operacionais da empresa
    - emissor: acesso aos módulos DCE/Pessoas/Produtos
    - viewer: apenas visualização (list/retrieve)
    """

    _action_map: ClassVar[dict] = {
        'list': 'can_view',
        'retrieve': 'can_view',
        'create': 'can_create',
        'update': 'can_edit',
        'partial_update': 'can_edit',
        'destroy': 'can_delete',
    }
    _module_matrix: ClassVar[dict] = {
        'superadmin': {
            'products': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'persons': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'dce': {'can_view', 'can_create', 'can_edit', 'can_delete'},
        },
        'admin': {
            'products': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'persons': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'dce': {'can_view', 'can_create', 'can_edit', 'can_delete'},
        },
        'emissor': {
            'products': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'persons': {'can_view', 'can_create', 'can_edit', 'can_delete'},
            'dce': {'can_view', 'can_create', 'can_edit', 'can_delete'},
        },
        'viewer': {
            'products': {'can_view'},
            'persons': {'can_view'},
            'dce': {'can_view'},
        },
    }

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        if request.user.is_superadmin:
            return True

        module = str(getattr(view, 'module_name', '')).strip()
        if not module:
            return False

        action = getattr(view, 'action', 'list')
        field = self._action_map.get(action, 'can_view')
        profile = request.user.profile
        allowed_actions = self._module_matrix.get(profile, {}).get(module, set())

        return field in allowed_actions

    def has_object_permission(self, request, _view, obj):  # noqa: PLR6301
        """Segunda linha de defesa: garante que o objeto pertence à empresa."""
        if request.user.is_superadmin:
            return True
        if hasattr(obj, 'company_id'):
            return obj.company_id == request.user.company_id
        return False
