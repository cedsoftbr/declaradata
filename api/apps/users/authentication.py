from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class SessionAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_sv = int(validated_token.get('sv', 0))
        if token_sv != int(user.session_version or 0):
            raise InvalidToken('Sessão inválida: faça login novamente.')
        return user
