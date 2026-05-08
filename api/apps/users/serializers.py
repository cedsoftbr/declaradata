import secrets
from urllib.parse import urlparse

from dj_rest_auth.serializers import (
    PasswordResetSerializer as BasePasswordResetSerializer,
)
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.core.cache import cache
from django.core.signing import TimestampSigner
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.companies.models import Company
from apps.persons.models import Person

from .emails import send_2fa_pin_email
from .models import Role, RolePermission, User, UserConsentAudit


class TwoFARequired(Exception):
    def __init__(self, session_token: str):
        self.session_token = session_token


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(
        style={'input_type': 'password'}, trim_whitespace=False
    )

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            email=attrs['email'],
            password=attrs['password'],
        )
        if not user:
            raise serializers.ValidationError(
                'E-mail não encontrado ou senha inválida.',
                code='authorization',
            )
        if not user.is_active:
            raise serializers.ValidationError('Conta desativada.', code='authorization')
        if (
            not user.is_superadmin
            and user.company_id
            and user.company
            and not user.company.is_active
        ):
            raise serializers.ValidationError(
                'Empresa inativa. Acesso bloqueado.',
                code='authorization',
            )
        if user.twofa_enabled:
            pin = f'{secrets.randbelow(1_000_000):06d}'
            cache.set(f'2fa:{user.pk}', {'pin': pin, 'attempts': 0}, timeout=600)
            send_2fa_pin_email(user, pin)
            signer = TimestampSigner(salt='2fa-session')
            raise TwoFARequired(signer.sign(str(user.pk)))

        user.session_version = (user.session_version or 0) + 1
        user.save(update_fields=['session_version'])
        update_last_login(None, user)
        attrs['user'] = user
        return attrs


class SessionAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['sv'] = int(user.session_version or 1)
        return token


class SessionAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        # Ler o sv ANTES de super().validate(), que blacklista o token após rotação.
        # Após a blacklist, RefreshToken(attrs['refresh']) lançaria TokenError.
        refresh = RefreshToken(attrs['refresh'])
        user_id = refresh.get('user_id')
        token_sv = int(refresh.get('sv', 0))

        user = User.objects.filter(id=user_id, is_active=True).first()
        if not user:
            raise serializers.ValidationError('Usuário inválido.', code='authorization')
        if token_sv != int(user.session_version or 0):
            raise serializers.ValidationError(
                'Sessão inválida: faça login novamente.',
                code='authorization',
            )
        return super().validate(attrs)


# ── Password reset ────────────────────────────────────────────────────────────


class PasswordResetSerializer(BasePasswordResetSerializer):
    """
    Sobrescreve o serializer padrão do dj-rest-auth para usar FRONTEND_URL
    em vez de django.contrib.sites na composição do link de reset.
    """

    @staticmethod
    def get_email_options():
        parsed = urlparse(settings.FRONTEND_URL)
        return {
            'domain_override': parsed.netloc,
            'use_https': parsed.scheme == 'https',
            'email_template_name': 'email/set_password.txt',
            'html_email_template_name': 'email/set_password.html',
            'extra_email_context': {
                'is_new_user': False,
            },
        }


# ── Role ──────────────────────────────────────────────────────────────────────


class RolePermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RolePermission
        fields = ('id', 'module', 'can_view', 'can_create', 'can_edit', 'can_delete')


class RoleSerializer(serializers.ModelSerializer):
    permissions = RolePermissionSerializer(many=True)
    company_id = serializers.PrimaryKeyRelatedField(
        source='company',
        queryset=Role.company.field.related_model.objects.all(),
        required=False,
        allow_null=True,
    )
    company_name = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = (
            'id',
            'company_id',
            'company_name',
            'name',
            'description',
            'can_manage_users',
            'permissions',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_company_name(obj):
        if not obj.company:
            return None
        return obj.company.trade_name or obj.company.name

    @staticmethod
    def create(validated_data):
        permissions = validated_data.pop('permissions', [])
        role = Role.objects.create(**validated_data)
        for perm in permissions:
            RolePermission.objects.create(role=role, **perm)
        return role

    @staticmethod
    def update(instance, validated_data):
        permissions = validated_data.pop('permissions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permissions is not None:
            instance.permissions.all().delete()
            for perm in permissions:
                RolePermission.objects.create(role=instance, **perm)
        return instance


# ── User ──────────────────────────────────────────────────────────────────────


class UserSerializer(serializers.ModelSerializer):
    """Detalhes do usuário autenticado — /api/users/me/."""

    role_id = serializers.PrimaryKeyRelatedField(source='role', read_only=True)
    role_name = serializers.CharField(source='role.name', read_only=True, default=None)
    profile = serializers.ChoiceField(choices=User.Profile.choices, read_only=True)
    can_manage_users = serializers.BooleanField(read_only=True)
    company_id = serializers.UUIDField(read_only=True)
    company_name = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    legal_terms_version = serializers.CharField(read_only=True)
    terms_accepted_at = serializers.DateTimeField(read_only=True)
    privacy_policy_accepted_at = serializers.DateTimeField(read_only=True)
    accept_terms = serializers.BooleanField(write_only=True, required=False)
    accept_privacy = serializers.BooleanField(write_only=True, required=False)
    twofa_enabled = serializers.BooleanField(required=False)
    allowed_emitente_ids = serializers.PrimaryKeyRelatedField(
        source='allowed_emitentes',
        many=True,
        read_only=True,
    )

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'first_name',
            'last_name',
            'is_staff',
            'is_superuser',
            'role_id',
            'role_name',
            'profile',
            'can_manage_users',
            'company_id',
            'company_name',
            'permissions',
            'legal_terms_version',
            'terms_accepted_at',
            'privacy_policy_accepted_at',
            'accept_terms',
            'accept_privacy',
            'twofa_enabled',
            'allowed_emitente_ids',
        )
        read_only_fields = (
            'id',
            'email',
            'is_staff',
            'is_superuser',
            'role_id',
            'role_name',
            'profile',
            'can_manage_users',
            'company_id',
            'company_name',
            'permissions',
            'legal_terms_version',
            'terms_accepted_at',
            'privacy_policy_accepted_at',
            'allowed_emitente_ids',
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_company_name(obj):
        if not obj.company_id:
            return None
        row = (
            Company.objects
            .filter(pk=obj.company_id)
            .values_list('trade_name', 'name')
            .first()
        )
        if not row:
            return None
        trade_name, name = row
        return trade_name or name

    @extend_schema_field(
        serializers.DictField(
            child=serializers.DictField(child=serializers.BooleanField())
        )
    )
    @staticmethod
    def get_permissions(obj):
        if obj.is_superadmin:
            return {
                m: {
                    'can_view': True,
                    'can_create': True,
                    'can_edit': True,
                    'can_delete': True,
                }
                for m in ('products', 'persons', 'dce')
            }
        if obj.profile in {User.Profile.ADMIN, User.Profile.EMISSOR}:
            return {
                m: {
                    'can_view': True,
                    'can_create': True,
                    'can_edit': True,
                    'can_delete': True,
                }
                for m in ('products', 'persons', 'dce')
            }
        if obj.profile == User.Profile.VIEWER:
            return {
                m: {
                    'can_view': True,
                    'can_create': False,
                    'can_edit': False,
                    'can_delete': False,
                }
                for m in ('products', 'persons', 'dce')
            }
        if not obj.role:
            return {}
        return {
            p.module: {
                'can_view': p.can_view,
                'can_create': p.can_create,
                'can_edit': p.can_edit,
                'can_delete': p.can_delete,
            }
            for p in obj.role.permissions.all()  # prefetchado no view
        }

    def update(self, instance, validated_data):
        accept_terms = bool(validated_data.pop('accept_terms', False))
        accept_privacy = bool(validated_data.pop('accept_privacy', False))

        if 'twofa_enabled' in validated_data:
            allowed = {
                User.Profile.ADMIN,
                User.Profile.EMISSOR,
                User.Profile.SUPERADMIN,
            }
            if instance.profile not in allowed:
                raise serializers.ValidationError({
                    'twofa_enabled': 'Perfil não permite habilitar 2FA.'
                })
            instance.twofa_enabled = validated_data.pop('twofa_enabled')
        else:
            validated_data.pop('twofa_enabled', None)

        for attr in ('first_name', 'last_name'):
            if attr in validated_data:
                setattr(instance, attr, validated_data[attr])

        now = timezone.now()
        current_version = getattr(settings, 'LEGAL_TERMS_VERSION', '2026-04-15')
        if accept_terms:
            instance.terms_accepted_at = now
            instance.legal_terms_version = current_version
        if accept_privacy:
            instance.privacy_policy_accepted_at = now
            instance.legal_terms_version = current_version

        instance.save()

        if accept_terms or accept_privacy:
            request = self.context.get('request')
            xff = ''
            user_agent = ''
            remote_addr = ''
            if request is not None:
                xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
                remote_addr = request.META.get('REMOTE_ADDR', '')
                user_agent = request.META.get('HTTP_USER_AGENT', '')

            ip_address = (xff.split(',')[0].strip() if xff else remote_addr)[:64]
            UserConsentAudit.objects.create(
                user=instance,
                legal_terms_version=current_version,
                accepted_terms=accept_terms,
                accepted_privacy=accept_privacy,
                ip_address=ip_address,
                user_agent=user_agent,
            )

        return instance


class CustomJWTSerializer(serializers.Serializer):
    """
    Serializer customizado para retorno do JWT.
    Garante que o refresh token seja retornado no body da resposta,
    junto com os dados completos do usuário (role, permissions, empresa).
    """

    access = serializers.CharField()
    refresh = serializers.CharField()
    user = serializers.SerializerMethodField()

    @extend_schema_field(UserSerializer)
    def get_user(self, obj):

        User = get_user_model()
        user = User.objects.select_related('company', 'role').get(pk=obj['user'].pk)
        return UserSerializer(user, context=self.context).data


class UserManageSerializer(serializers.ModelSerializer):
    """
    Criação e edição de usuários.
    Superadmin: acesso total, incluindo is_staff.
    Gestor de empresa: só pode criar/editar usuários da própria empresa,
                       só pode atribuir roles da própria empresa.
    """

    profile = serializers.ChoiceField(
        choices=User.Profile.choices,
        required=False,
    )
    company_id = serializers.PrimaryKeyRelatedField(
        source='company',
        queryset=User.company.field.related_model.objects.all(),
        required=False,
        allow_null=True,
    )
    company_name = serializers.SerializerMethodField()
    allowed_emitente_ids = serializers.PrimaryKeyRelatedField(
        source='allowed_emitentes',
        queryset=Person.objects.filter(is_emitente=True),
        many=True,
        required=False,
    )

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'first_name',
            'last_name',
            'profile',
            'company_id',
            'company_name',
            'is_active',
            'is_staff',
            'can_manage_users',
            'allowed_emitente_ids',
            'last_login',
            'date_joined',
        )
        read_only_fields = ('last_login', 'date_joined')

    @extend_schema_field(serializers.CharField(allow_null=True))
    @staticmethod
    def get_company_name(obj):
        if not obj.company:
            return None
        return obj.company.trade_name or obj.company.name

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return fields

        if not request.user.is_superadmin:
            # Gestor de empresa não pode promover ninguém a staff
            fields['is_staff'].read_only = True
            # Empresa fica travada na empresa do gestor
            fields['company_id'].read_only = True
            # Gestor não pode criar superadmin
            fields['profile'].choices = [
                choice
                for choice in User.Profile.choices
                if choice[0] != User.Profile.SUPERADMIN
            ]

        return fields

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return attrs

        profile = attrs.get('profile', None)
        company = attrs.get('company', None)

        if request.user.is_superadmin:
            if profile is None:
                # Em PATCH, preserva o profile da instância; em POST, default emissor
                instance_profile = getattr(self.instance, 'profile', None)
                attrs['profile'] = instance_profile or User.Profile.EMISSOR
            effective_profile = attrs.get('profile')
            if effective_profile == User.Profile.SUPERADMIN:
                # Superadmin não pertence a nenhuma empresa
                attrs['company'] = None
            elif (
                effective_profile in {User.Profile.ADMIN, User.Profile.EMISSOR}
                and not company
                and not getattr(self.instance, 'company_id', None)
            ):
                raise serializers.ValidationError({
                    'company_id': 'Perfis Admin e Emissor precisam de empresa.'
                })
            self._validate_company_active_user_limit(attrs)
            return attrs

        # Admin empresa: só administra usuários da própria empresa
        attrs['company'] = request.user.company
        if profile is None:
            instance_profile = getattr(self.instance, 'profile', None)
            attrs['profile'] = instance_profile or User.Profile.EMISSOR
        if attrs.get('profile') == User.Profile.SUPERADMIN:
            raise serializers.ValidationError({
                'profile': 'Você não pode criar/editar usuários Superadmin.'
            })
        self._validate_company_active_user_limit(attrs)
        self._validate_allowed_emitentes(attrs)
        return attrs

    def _validate_allowed_emitentes(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return

        if 'allowed_emitentes' not in attrs:
            return

        emitentes = list(attrs.get('allowed_emitentes') or [])
        if not emitentes:
            return

        company = attrs.get('company')
        if company is None and self.instance is not None:
            company = self.instance.company

        if company is None:
            raise serializers.ValidationError({
                'allowed_emitente_ids': (
                    'Não é possível vincular emitentes sem empresa definida.'
                )
            })

        invalid = [
            str(person.id)
            for person in emitentes
            if (not person.is_emitente) or person.company_id != company.id
        ]
        if invalid:
            raise serializers.ValidationError({
                'allowed_emitente_ids': (
                    'Todos os emitentes vinculados devem ser emitentes válidos '
                    'da mesma empresa do usuário.'
                )
            })

    def _validate_company_active_user_limit(self, attrs):
        """
        Limita usuários ativos por empresa para qualquer perfil.
        """
        instance = getattr(self, 'instance', None)
        effective_company = attrs.get(
            'company', instance.company if instance is not None else None
        )
        effective_is_active = attrs.get(
            'is_active', instance.is_active if instance is not None else True
        )

        should_count = bool(effective_is_active)
        if not should_count or not effective_company:
            return

        active_count = User.objects.filter(
            company=effective_company,
            is_active=True,
        )
        if instance is not None and instance.pk:
            active_count = active_count.exclude(pk=instance.pk)

        if active_count.count() >= effective_company.active_user_limit:
            raise serializers.ValidationError({
                'company_id': (
                    'Limite de usuários ativos atingido para esta empresa '
                    f'({effective_company.active_user_limit}).'
                )
            })

    @staticmethod
    def create(validated_data):
        allowed_emitentes = validated_data.pop('allowed_emitentes', [])
        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
        if allowed_emitentes:
            user.allowed_emitentes.set(allowed_emitentes)
        return user

    @staticmethod
    def update(instance, validated_data):
        allowed_emitentes = validated_data.pop('allowed_emitentes', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if allowed_emitentes is not None:
            instance.allowed_emitentes.set(allowed_emitentes)
        return instance
