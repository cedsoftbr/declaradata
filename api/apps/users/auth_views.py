from typing import ClassVar

from dj_rest_auth.views import PasswordResetView as BasePasswordResetView
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import SessionAwareTokenRefreshSerializer
from .throttles import PasswordResetThrottle


class SessionAwareTokenRefreshView(TokenRefreshView):
    serializer_class = SessionAwareTokenRefreshSerializer


class ThrottledPasswordResetView(BasePasswordResetView):
    throttle_classes: ClassVar[list] = [PasswordResetThrottle]
