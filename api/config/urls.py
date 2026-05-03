from dj_rest_auth.views import (
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    UserDetailsView,
)
from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.users.auth_views import (
    SessionAwareTokenRefreshView,
    ThrottledPasswordResetView,
)
from apps.users.urls import users_router
from apps.users.views import LoginView, TwoFAVerifyView

urlpatterns = [
    path('api/health', lambda _: JsonResponse({'status': 'ok'})),
    path('api/health/', lambda _: JsonResponse({'status': 'ok'})),
    # Auth
    path('api/auth/login/', LoginView.as_view(), name='auth_login'),
    path('api/auth/2fa/verify/', TwoFAVerifyView.as_view(), name='auth_2fa_verify'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth_logout'),
    path(
        'api/auth/token/refresh/',
        SessionAwareTokenRefreshView.as_view(),
        name='auth_token_refresh',
    ),
    # Recuperação de senha
    path(
        'api/auth/password/reset/',
        ThrottledPasswordResetView.as_view(),
        name='auth_password_reset',
    ),
    path(
        'api/auth/password/reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='auth_password_reset_confirm',
    ),
    # Perfil do usuário autenticado
    path('api/users/me/', UserDetailsView.as_view(), name='users_me'),
    path(
        'api/users/me/change-password/',
        PasswordChangeView.as_view(),
        name='users_change_password',
    ),
    # Usuários
    path('api/users/', include(users_router.urls)),
    # Apps de negócio
    path('api/companies/', include('apps.companies.urls')),
    path('api/locations/', include('apps.locations.urls')),
    path('api/persons/', include('apps.persons.urls')),
    path('api/products/', include('apps.products.urls')),
    path('api/shipments/', include('apps.shipments.urls')),
    path('api/billing/', include('apps.billing.urls')),
]

if settings.DEBUG:
    urlpatterns += [
        # Documentação (somente desenvolvimento/staging)
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path(
            'api/docs/',
            SpectacularSwaggerView.as_view(url_name='schema'),
            name='swagger-ui',
        ),
        path(
            'api/redoc/',
            SpectacularRedocView.as_view(url_name='schema'),
            name='redoc',
        ),
    ]
