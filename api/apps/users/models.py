import uuid
from typing import ClassVar

from django.contrib.auth.models import AbstractUser, UserManager as BaseUserManager
from django.db import models
from django.db.models import Q, UniqueConstraint


class UserManager(BaseUserManager):
    """Manager customizado para o modelo User onde o e-mail é o identificador."""

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('O e-mail deve ser informado.')
        email = self.normalize_email(email)

        # Garante que o username seja o e-mail se não for fornecido explicitamente
        # ou se quisermos forçar que sejam iguais.
        # AbstractUser ainda exige um username no nível do modelo/banco.
        username = extra_fields.pop('username', email)

        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('profile', 'superadmin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser deve ter is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser deve ter is_superuser=True.')

        return self._create_user(email, password, **extra_fields)


class Role(models.Model):
    """
    Role de permissões.

    - company=None  → role global, criada pelo superadmin, visível a todas as empresas.
    - company=<obj> → role da empresa, criada pelo gestor da empresa, visível só a ela.

    can_manage_users=True concede ao usuário a capacidade de gerenciar
    usuários e roles da própria empresa (equivale ao "admin de empresa").
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    class Module(models.TextChoices):
        PRODUCTS = 'products', 'Produtos'
        PERSONS = 'persons', 'Pessoas'
        DCE = 'dce', 'DCE'

    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='roles',
        verbose_name='empresa',
    )
    name = models.CharField(max_length=100, verbose_name='nome')
    description = models.CharField(max_length=255, blank=True, verbose_name='descrição')
    can_manage_users = models.BooleanField(
        default=False,
        verbose_name='pode gerenciar usuários',
        help_text=(
            'Permite criar, editar e desativar usuários e roles da própria empresa.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'role'
        verbose_name_plural = 'roles'
        ordering: ClassVar[list] = ['name']
        constraints: ClassVar[list] = [
            # Nomes únicos entre roles globais (company=null)
            UniqueConstraint(
                fields=['name'],
                condition=Q(company=None),
                name='unique_global_role_name',
            ),
            # Nomes únicos dentro de cada empresa
            UniqueConstraint(
                fields=['company', 'name'],
                name='unique_company_role_name',
            ),
        ]

    def __str__(self):
        prefix = (
            self.company.trade_name or self.company.name if self.company else 'Global'
        )
        return f'{self.name} ({prefix})'


class RolePermission(models.Model):
    """Permissões de um módulo para uma role."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    role = models.ForeignKey(
        Role,
        on_delete=models.CASCADE,
        related_name='permissions',
        verbose_name='role',
    )
    module = models.CharField(max_length=50, choices=Role.Module, verbose_name='módulo')
    can_view = models.BooleanField(default=True, verbose_name='visualizar')
    can_create = models.BooleanField(default=False, verbose_name='criar')
    can_edit = models.BooleanField(default=False, verbose_name='editar')
    can_delete = models.BooleanField(default=False, verbose_name='excluir')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='atualizado em')

    class Meta:
        unique_together = ('role', 'module')
        verbose_name = 'permissão de módulo'
        verbose_name_plural = 'permissões de módulo'
        ordering: ClassVar[list] = ['module']


class User(AbstractUser):
    class Profile(models.TextChoices):
        SUPERADMIN = 'superadmin', 'Superadmin'
        ADMIN = 'admin', 'Admin'
        EMISSOR = 'emissor', 'Emissor'
        VIEWER = 'viewer', 'Visualizador'

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    email = models.EmailField(unique=True)
    role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='role',
    )
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='empresa',
    )
    allowed_emitentes = models.ManyToManyField(
        'persons.Person',
        related_name='allowed_users',
        blank=True,
        verbose_name='emitentes permitidos',
    )
    can_manage_users = models.BooleanField(
        default=False,
        verbose_name='pode gerenciar usuários',
        help_text='Gestor da empresa — acesso total e gerenciamento de usuários/roles.',
    )
    profile = models.CharField(
        max_length=20,
        choices=Profile.choices,
        default=Profile.EMISSOR,
        db_index=True,
        verbose_name='perfil',
    )
    legal_terms_version = models.CharField(
        max_length=32,
        blank=True,
        verbose_name='versão de termos e privacidade aceita',
    )
    terms_accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='data/hora de aceite dos termos',
    )
    privacy_policy_accepted_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='data/hora de aceite da política de privacidade',
    )
    session_version = models.PositiveIntegerField(
        default=1,
        verbose_name='versão da sessão',
    )
    twofa_enabled = models.BooleanField(
        default=False,
        verbose_name='2FA habilitado',
    )

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS: ClassVar[list] = []

    class Meta:
        verbose_name = 'usuário'
        verbose_name_plural = 'usuários'

    def save(self, *args, **kwargs):
        self.username = self.email
        if self.profile == self.Profile.SUPERADMIN:
            self.is_staff = True
            self.is_superuser = True
            self.can_manage_users = True
        else:
            # profile != SUPERADMIN tem precedência sobre is_staff/is_superuser
            self.is_staff = False
            self.is_superuser = False
            if self.profile == self.Profile.EMISSOR and self.can_manage_users:
                self.profile = self.Profile.ADMIN
            self.can_manage_users = self.profile == self.Profile.ADMIN
        super().save(*args, **kwargs)

    @property
    def is_superadmin(self) -> bool:
        """Acesso irrestrito a tudo."""
        return bool(
            self.is_superuser
            or self.is_staff
            or self.profile == self.Profile.SUPERADMIN
        )

    @property
    def is_company_admin(self) -> bool:
        return bool(self.profile == self.Profile.ADMIN and self.company_id is not None)


class UserConsentAudit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='consent_audits',
        verbose_name='usuário',
    )
    legal_terms_version = models.CharField(
        max_length=32,
        verbose_name='versão de termos e privacidade aceita',
    )
    accepted_terms = models.BooleanField(default=False, verbose_name='aceitou termos')
    accepted_privacy = models.BooleanField(
        default=False, verbose_name='aceitou privacidade'
    )
    ip_address = models.CharField(max_length=64, blank=True, verbose_name='ip')
    user_agent = models.TextField(blank=True, verbose_name='user agent')
    accepted_at = models.DateTimeField(auto_now_add=True, verbose_name='aceito em')

    class Meta:
        verbose_name = 'auditoria de aceite'
        verbose_name_plural = 'auditorias de aceite'
        ordering: ClassVar[list] = ['-accepted_at']
