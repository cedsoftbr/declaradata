from datetime import timedelta
from pathlib import Path

import dj_database_url
import sentry_sdk
from celery.schedules import crontab
from decouple import config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_log_level(var_name: str, default: str) -> str:
    allowed_levels = {'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG', 'NOTSET'}
    raw_value = config(var_name, default='').strip().upper()
    if not raw_value:
        return default
    return raw_value if raw_value in allowed_levels else default


SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG', default=False, cast=bool)


def parse_csv_hosts(raw_value: str) -> list[str]:
    return [host.strip() for host in raw_value.split(',') if host.strip()]


default_allowed_hosts = [
    'localhost',
    '127.0.0.1',
    '.railway.app',
    'healthcheck.railway.app',
]
env_allowed_hosts = parse_csv_hosts(config('ALLOWED_HOSTS', default=''))
ALLOWED_HOSTS = list(dict.fromkeys([*default_allowed_hosts, *env_allowed_hosts]))

# ── Apps ───────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',  # exigido pelo AuthenticationMiddleware no Django 6
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    'django_filters',
    'dj_rest_auth',
    'apps.core',
    'apps.users',
    'apps.companies',
    'apps.locations',
    'apps.persons',
    'apps.products',
    'apps.shipments',
    'apps.billing',
]

# ── Middleware ─────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    # exigido pelo AuthenticationMiddleware no Django 6
    'django.middleware.common.CommonMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# ── Templates ─────────────────────────────────────────────────────────────────
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ── Database ──────────────────────────────────────────────────────────────────
# Formato: postgres://USER:PASSWORD@HOST:PORT/NAME
database_url = config('DATABASE_URL', default='')
if not database_url:
    if DEBUG:
        database_url = 'postgres://postgres:@localhost:5432/declaradata'
    else:
        raise ImproperlyConfigured('DATABASE_URL is required when DEBUG=False.')

DATABASES = {
    'default': dj_database_url.parse(
        database_url,
        conn_max_age=config('DB_CONN_MAX_AGE', default=60, cast=int),
    )
}

CACHES = {
    'default': {
        'BACKEND': config(
            'CACHE_BACKEND', default='django.core.cache.backends.locmem.LocMemCache'
        ),
    }
}

# ── Static files ──────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.'
        'UserAttributeSimilarityValidator'
    },
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
]

# ── Email ─────────────────────────────────────────────────────────────────────
DEFAULT_EMAIL_BACKEND = (
    'django.core.mail.backends.console.EmailBackend'
    if DEBUG
    else 'apps.core.email_backends.BrevoEmailBackend'
)
EMAIL_BACKEND = config('EMAIL_BACKEND', default=DEFAULT_EMAIL_BACKEND)
EMAIL_HOST = config('EMAIL_HOST', default='')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@declaradata.com.br')
BREVO_API_KEY = config('BREVO_API_KEY', default='')
BREVO_API_URL = config('BREVO_API_URL', default='https://api.brevo.com/v3/smtp/email')
BREVO_TIMEOUT = config('BREVO_TIMEOUT', default=15, cast=int)

FRONTEND_URL = config('FRONTEND_URL', default='http://localhost:3000')
LEGAL_TERMS_VERSION = config('LEGAL_TERMS_VERSION', default='2026-04-15')

# Chave Fernet para criptografia de certificados digitais A1.
# Gere com: python -c "from cryptography.fernet import Fernet; \
# print(Fernet.generate_key().decode())"
CERTIFICATE_ENCRYPTION_KEY = config('CERTIFICATE_ENCRYPTION_KEY', default='')

# Token de reset expira em 24 horas
PASSWORD_RESET_TIMEOUT = 86400

# ── Localização ───────────────────────────────────────────────────────────────
LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── DRF ───────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'EXCEPTION_HANDLER': 'apps.core.exception_handler.custom_exception_handler',
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.users.authentication.SessionAwareJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_THROTTLE_CLASSES': (
        []
        if config('DISABLE_THROTTLING', default=False, cast=bool)
        else [
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
        ]
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/minute',
        'user': '1000/minute',
        'login': '10/minute',
        'password_reset': '5/minute',
    },
}

# ── JWT ───────────────────────────────────────────────────────────────────────
# Fluxo:
#   1. POST /api/auth/login/  → { access, refresh }
#   2. Requisições:           Authorization: Bearer <access>
#   3. Access expirou?        POST /api/auth/token/refresh/ { refresh } \
#                             → { access, refresh }
#   4. Logout:                POST /api/auth/logout/ { refresh } \
#                             (invalida o refresh via blacklist)
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),  # frontend armazena em memória
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=30
    ),  # frontend armazena em cookie httpOnly
    'ROTATE_REFRESH_TOKENS': True,  # cada refresh gera novo par de tokens
    'BLACKLIST_AFTER_ROTATION': True,  # token antigo vai para blacklist
    'UPDATE_LAST_LOGIN': True,  # atualiza user.last_login a cada refresh
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ── dj-rest-auth ──────────────────────────────────────────────────────────────
REST_AUTH = {
    'USE_JWT': True,
    'JWT_AUTH_COOKIE': None,  # tokens retornados no body (não em cookie)
    'JWT_AUTH_REFRESH_COOKIE': None,  # o frontend decide como armazenar o refresh
    'JWT_AUTH_HTTPONLY': False,
    'JWT_SERIALIZER': 'apps.users.serializers.CustomJWTSerializer',
    'USER_DETAILS_SERIALIZER': 'apps.users.serializers.UserSerializer',
    'LOGIN_SERIALIZER': 'apps.users.serializers.LoginSerializer',
    'TOKEN_MODEL': None,
    'SESSION_LOGIN': False,
    'OLD_PASSWORD_FIELD_ENABLED': False,
    'PASSWORD_RESET_SERIALIZER': 'apps.users.serializers.PasswordResetSerializer',
    'JWT_TOKEN_CLAIMS_SERIALIZER': (
        'apps.users.serializers.SessionAwareTokenObtainPairSerializer'
    ),
}

# ── Spectacular ───────────────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    'TITLE': 'Declaradata API',
    'DESCRIPTION': 'API do SaaS logístico Declaradata',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https?://.*\.declaradata\.com\.br(:\d+)?$',
]
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES += [
        r'^https?://.*\.localhost(:\d+)?$',
        r'^https?://localhost(:\d+)?$',
    ]

# ── Segurança (produção) ───────────────────────────────────────────────────────
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
    SECURE_REDIRECT_EXEMPT = [r'^api/health/?$']
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    CSRF_COOKIE_SECURE = True

# ── Cloudflare R2 (S3 Compatible) ─────────────────────────────────────────────
R2_ACCESS_KEY_ID = config('R2_ACCESS_KEY_ID', default='')
R2_SECRET_ACCESS_KEY = config('R2_SECRET_ACCESS_KEY', default='')
R2_ENDPOINT_URL = config('R2_ENDPOINT_URL', default='')
R2_BUCKET_NAME = config('R2_BUCKET_NAME', default='')
R2_PUBLIC_DOMAIN = config('R2_PUBLIC_DOMAIN', default='')  # e.g. pub-xxx.r2.dev

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config(
    'CELERY_RESULT_BACKEND', default='redis://localhost:6379/0'
)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=False, cast=bool)
CELERY_TASK_STORE_EAGER_RESULT = config(
    'CELERY_TASK_STORE_EAGER_RESULT', default=False, cast=bool
)
CELERY_RESULT_EXPIRES = 60 * 60 * 24  # 24 horas

# ── SEFAZ-PR DCe ─────────────────────────────────────────────────────────────
# Webservices SEFAZ-PR (SOAP 1.1 com mTLS).
# tpAmb=1 → Produção | tpAmb=2 → Homologação
SEFAZ_DCE_URLS = {
    # ── PRODUÇÃO DESABILITADA ─────────────────────────────────────────────────
    # URLs reais comentadas até a homologação ser concluída e aprovada.
    # Quando estiver pronto, substitua pelos endereços abaixo:
    #   'autorizacao': 'https://dce.fazenda.pr.gov.br/dce/DCeAutorizacao',
    #   'consulta':    'https://dce.fazenda.pr.gov.br/dce/DCeConsulta',
    #   'status':      'https://dce.fazenda.pr.gov.br/dce/DCeStatusServico',
    #   'eventos':     'https://dce.fazenda.pr.gov.br/dce/DCeRecepcaoEvento',
    #   'distribuicao':'https://dce.fazenda.pr.gov.br/dce/DCeDistribuicao',
    # Por enquanto aponta para homologação como fallback seguro.
    1: {  # Produção
        'autorizacao': 'https://dce.fazenda.pr.gov.br/dce/DCeAutorizacao',
        'consulta': 'https://dce.fazenda.pr.gov.br/dce/DCeConsulta',
        'status': 'https://dce.fazenda.pr.gov.br/dce/DCeStatusServico',
        'eventos': 'https://dce.fazenda.pr.gov.br/dce/DCeRecepcaoEvento',
        'distribuicao': 'https://dce.fazenda.pr.gov.br/dce/DCeDistribuicao',
    },
    2: {  # Homologação
        'autorizacao': 'https://homologacao.dce.fazenda.pr.gov.br/dce/DCeAutorizacao',
        'consulta': 'https://homologacao.dce.fazenda.pr.gov.br/dce/DCeConsulta',
        'status': 'https://homologacao.dce.fazenda.pr.gov.br/dce/DCeStatusServico',
        'eventos': 'https://homologacao.dce.fazenda.pr.gov.br/dce/DCeRecepcaoEvento',
        'distribuicao': 'https://homologacao.dce.fazenda.pr.gov.br/dce/DCeDistribuicao',
    },
    3: {  # Simulado (apenas para testes internos)
        'autorizacao': 'http://localhost/dce/DCeAutorizacao',
        'consulta': 'http://localhost/dce/DCeConsulta',
        'status': 'http://localhost/dce/DCeStatusServico',
        'eventos': 'http://localhost/dce/DCeRecepcaoEvento',
        'distribuicao': 'http://localhost/dce/DCeDistribuicao',
    },
}
SEFAZ_QR_CODE_URL = 'https://www.fazenda.pr.gov.br/dce/qrcode'
SEFAZ_CONSULTA_CHAVE_URL = 'https://www.fazenda.pr.gov.br/dce/consulta'
SEFAZ_TIMEOUT = config('SEFAZ_TIMEOUT', default=30, cast=int)
SEFAZ_VER_APLIC = config('SEFAZ_VER_APLIC', default='IntegraDCe-1.0')
SEFAZ_CA_BUNDLE_PATH = config(
    'SEFAZ_CA_BUNDLE_PATH',
    default=str(BASE_DIR / 'config' / 'certs' / 'icp-brasil-v10.pem'),
)


# Polling de distribuição DCe a cada 30 minutos
CELERY_BEAT_SCHEDULE = {
    'poll-dce-distribution': {
        'task': 'apps.shipments.tasks.dispatch_distribution_polling',
        'schedule': crontab(minute='*/30'),
    },
    'generate-monthly-invoices': {
        'task': 'apps.billing.tasks.generate_monthly_invoices_task',
        'schedule': crontab(minute=0, hour=0, day_of_month=1),
    },
}

# ── Logging ───────────────────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': env_log_level('LOG_LEVEL_LIBRARIES', 'ERROR'),
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': env_log_level('LOG_LEVEL_DJANGO', 'ERROR'),
            'propagate': False,
        },
        'django.utils.autoreload': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'django_fsm': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': env_log_level('LOG_LEVEL_APPS', 'DEBUG' if DEBUG else 'INFO'),
            'propagate': False,
        },
        'fontTools': {
            'handlers': ['console'],
            'level': env_log_level('LOG_LEVEL_LIBRARIES', 'ERROR'),
            'propagate': False,
        },
        'weasyprint': {
            'handlers': ['console'],
            'level': env_log_level('LOG_LEVEL_LIBRARIES', 'ERROR'),
            'propagate': False,
        },
        'pypdf': {
            'handlers': ['console'],
            'level': env_log_level('LOG_LEVEL_LIBRARIES', 'ERROR'),
            'propagate': False,
        },
    },
}

# ── Sentry ────────────────────────────────────────────────────────────────────
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment='production' if not DEBUG else 'development',
        traces_sample_rate=0.1,
        send_default_pii=False,
        enable_tracing=True,
    )
