from typing import ClassVar

from dj_rest_auth.views import LoginView as BaseLoginView
from django.contrib.auth.models import update_last_login
from django.core.cache import cache
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import send_welcome_email
from .models import Role, User
from .permissions import IsSuperAdminOrCompanyManager
from .serializers import (
    RoleSerializer,
    SessionAwareTokenObtainPairSerializer,
    TwoFARequired,
    UserManageSerializer,
)
from .throttles import LoginRateThrottle

_MAX_2FA_ATTEMPTS = 5


class LoginView(BaseLoginView):
    throttle_classes: ClassVar[list] = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except TwoFARequired as exc:
            return Response(
                {'requires_2fa': True, 'session_token': exc.session_token},
                status=status.HTTP_200_OK,
            )


class TwoFAVerifyView(APIView):
    throttle_classes: ClassVar[list] = [LoginRateThrottle]
    permission_classes: ClassVar[list] = [AllowAny]

    def post(self, request):  # noqa: PLR6301
        session_token = request.data.get('session_token', '')
        pin = str(request.data.get('pin', ''))

        signer = TimestampSigner(salt='2fa-session')
        try:
            user_id = signer.unsign(session_token, max_age=600)
        except (BadSignature, SignatureExpired):
            raise AuthenticationFailed(  # noqa: B904
                'Sessão expirada. Faça login novamente.'
            )

        user = get_object_or_404(User, pk=user_id, is_active=True)
        cache_key = f'2fa:{user.pk}'
        data = cache.get(cache_key)

        if not data:
            raise AuthenticationFailed('PIN expirado. Faça login novamente.')

        if data['attempts'] >= _MAX_2FA_ATTEMPTS:
            cache.delete(cache_key)
            raise AuthenticationFailed('Muitas tentativas. Faça login novamente.')

        if data['pin'] != pin:
            data['attempts'] += 1
            cache.set(cache_key, data, timeout=600)
            raise AuthenticationFailed('PIN incorreto.')

        cache.delete(cache_key)

        user.session_version = (user.session_version or 0) + 1
        update_last_login(None, user)
        user.save(update_fields=['session_version', 'last_login'])

        refresh = SessionAwareTokenObtainPairSerializer.get_token(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class RoleViewSet(viewsets.ModelViewSet):
    """
    CRUD de roles.

    Superadmin   → vê e gerencia todas as roles (globais e de empresas).
    Gestor       → vê e gerencia apenas as roles da própria empresa.
    """

    serializer_class = RoleSerializer
    permission_classes: ClassVar[list] = [IsSuperAdminOrCompanyManager]
    filter_backends: ClassVar[list] = [DjangoFilterBackend, filters.SearchFilter]
    search_fields: ClassVar[list[str]] = ['name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Role.objects.none()
        user = self.request.user
        qs = Role.objects.prefetch_related('permissions').select_related('company')
        if user.is_superadmin:
            return qs.order_by('company__name', 'name')
        return qs.filter(company=user.company_id).order_by('name')

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superadmin:
            serializer.save()
        else:
            # Gestor só pode criar roles para a própria empresa
            if serializer.validated_data.get('company') not in {None, user.company}:
                raise serializers.ValidationError({
                    'company_id': 'Você só pode criar roles para a sua empresa.'
                })
            serializer.save(company=user.company)

    def perform_update(self, serializer):
        user = self.request.user
        if user.is_superadmin:
            serializer.save()
            return

        requested_company = serializer.validated_data.get(
            'company', serializer.instance.company
        )
        if requested_company != user.company:
            raise serializers.ValidationError({
                'company_id': 'Você só pode editar roles da sua empresa.'
            })
        serializer.save(company=user.company)


class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD de usuários.

    Superadmin   → vê e gerencia todos os usuários.
    Gestor       → vê e gerencia apenas usuários da própria empresa.
    """

    serializer_class = UserManageSerializer
    permission_classes: ClassVar[list] = [IsSuperAdminOrCompanyManager]
    filter_backends: ClassVar[list] = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields: ClassVar[list] = [
        'is_active',
        'profile',
        'company',
        'is_staff',
        'is_superuser',
    ]
    search_fields: ClassVar[list[str]] = ['email', 'first_name', 'last_name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return User.objects.none()

        user = self.request.user
        qs = User.objects.select_related('role', 'company').prefetch_related(
            'allowed_emitentes'
        )

        # Superadmin (is_superuser=True ou is_staff=True) vê tudo
        if user.is_superadmin:
            return qs.order_by('email')

        # Gestor de empresa só vê usuários da sua própria empresa.
        # Se por algum erro o gestor não tiver empresa vinculada, ele não vê ninguém.
        if user.company_id is None:
            return User.objects.none()

        return qs.filter(company_id=user.company_id).order_by('email')

    def perform_create(self, serializer):
        requesting_user = self.request.user
        new_user = (
            serializer.save()
            if requesting_user.is_superadmin
            else serializer.save(company=requesting_user.company)
        )
        # Na criação a senha é inutilizável
        # o usuário define a própria via link no email
        send_welcome_email(new_user)

    @action(detail=True, methods=['post'], url_path='resend-invite')
    def resend_invite(self, _request, pk=None):  # noqa: ARG002
        """Reenvia o e-mail de convite para o usuário definir sua senha."""
        user = self.get_object()
        send_welcome_email(user)
        return Response(
            {'detail': 'Convite reenviado com sucesso.'}, status=status.HTTP_200_OK
        )
