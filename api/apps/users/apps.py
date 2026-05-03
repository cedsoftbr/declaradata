import contextlib

from django.apps import AppConfig

try:
    from drf_spectacular.extensions import OpenApiViewExtension
except ImportError:
    OpenApiViewExtension = None


class UsersConfig(AppConfig):
    name = 'apps.users'

    def ready(self):
        # Implicitly use self to avoid static method warning
        _ = self
        _remove_allauth_spectacular_extensions()


def _remove_allauth_spectacular_extensions():
    """
    drf-spectacular registra extensões built-in para as views de registro do
    dj-rest-auth (VerifyEmailView, ResendEmailVerificationView, RegisterView),
    que dependem de allauth. Como não usamos allauth, a importação dessas views
    gera RuntimeError durante a geração do schema.

    Remove essas extensões do registry para eliminar os warnings.
    """
    if OpenApiViewExtension is None:
        return

    with contextlib.suppress(Exception):
        OpenApiViewExtension._registry = [
            ext
            for ext in OpenApiViewExtension._registry
            if 'registration' not in str(getattr(ext, 'target_class', ''))
        ]
