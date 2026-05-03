import email.charset as _charset
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

# Força codificação 8bit para utf-8 em vez de quoted-printable.
# Sem isso, o Django/Python codifica o corpo como QP, transformando
# '=' em '=3D' e quebrando URLs longas no output do console em dev.
_charset.add_charset('utf-8', _charset.SHORTEST, None, None)


def _send(
    subject: str, to: str, txt_template: str, html_template: str, context: dict
) -> None:
    text = render_to_string(txt_template, context)
    html = render_to_string(html_template, context)
    msg = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to])
    msg.attach_alternative(html, 'text/html')
    msg.send()


def send_2fa_pin_email(user, pin: str) -> None:
    _send(
        subject='Seu código de verificação — Declaradata',
        to=user.email,
        txt_template='email/2fa_pin.txt',
        html_template='email/2fa_pin.html',
        context={'user': user, 'pin': pin, 'pin_digits': list(pin)},
    )


def send_welcome_email(user) -> None:
    """
    Enviado quando o superadmin cria um novo usuário (ou reenvio de convite).
    O link redireciona para /auth/set-password onde o usuário define a própria senha.
    O token expira em 24 horas (PASSWORD_RESET_TIMEOUT).
    """
    parsed = urlparse(settings.FRONTEND_URL)
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    _send(
        subject='Bem-vindo ao Declaradata — defina sua senha',
        to=user.email,
        txt_template='email/set_password.txt',
        html_template='email/set_password.html',
        context={
            'user': user,
            'uid': uid,
            'token': token,
            'protocol': parsed.scheme,
            'domain': parsed.netloc,
            'is_new_user': True,
        },
    )
