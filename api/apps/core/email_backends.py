import base64
import logging
from collections.abc import Iterable

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.backends.console import EmailBackend as ConsoleEmailBackend
from django.core.mail.message import EmailMessage

logger = logging.getLogger(__name__)


class BrevoEmailBackend(BaseEmailBackend):
    """
    Backend de e-mail via API transacional da Brevo.

    Em DEBUG, delega para o backend de console para manter o comportamento de
    desenvolvimento (e-mails aparecendo no terminal).
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.api_key = kwargs.get('api_key') or getattr(settings, 'BREVO_API_KEY', '')
        self.api_url = kwargs.get('api_url') or getattr(
            settings, 'BREVO_API_URL', 'https://api.brevo.com/v3/smtp/email'
        )
        self.timeout = kwargs.get('timeout') or getattr(settings, 'BREVO_TIMEOUT', 15)
        self.console_backend = ConsoleEmailBackend(fail_silently=self.fail_silently)

    def send_messages(self, email_messages: Iterable[EmailMessage] | None) -> int:
        if not email_messages:
            return 0

        # Mantém experiência de desenvolvimento inalterada.
        if settings.DEBUG:
            return self.console_backend.send_messages(email_messages)

        if not self.api_key:
            msg = 'BREVO_API_KEY não configurada para envio de e-mails.'
            logger.error(msg)
            if self.fail_silently:
                return 0
            raise ValueError(msg)

        sent = 0
        headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': self.api_key,
        }

        for message in email_messages:
            payload = self._build_payload(message)
            try:
                resp = requests.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                sent += 1
            except Exception:
                logger.exception(
                    'Falha ao enviar e-mail pela Brevo para %s',
                    ','.join(message.recipients()),
                )
                if not self.fail_silently:
                    raise

        return sent

    @staticmethod
    def _build_payload(message: EmailMessage) -> dict:
        recipients = message.recipients()
        if not recipients:
            raise ValueError('Mensagem sem destinatário.')

        html_content = next(
            (c for c, m in getattr(message, 'alternatives', []) if m == 'text/html'),
            None,
        )

        payload: dict = {
            'sender': {'email': message.from_email or settings.DEFAULT_FROM_EMAIL},
            'to': [{'email': email} for email in message.to],
            'subject': message.subject or '',
        }

        # Extensão opcional de payload via helper
        BrevoEmailBackend._add_optional_fields(payload, message, html_content)

        attachments = BrevoEmailBackend._process_attachments(message.attachments)
        if attachments:
            payload['attachment'] = attachments

        return payload

    @staticmethod
    def _add_optional_fields(
        payload: dict, message: EmailMessage, html_content: str | None
    ):
        if message.cc:
            payload['cc'] = [{'email': email} for email in message.cc]
        if message.bcc:
            payload['bcc'] = [{'email': email} for email in message.bcc]
        if message.reply_to:
            payload['replyTo'] = {'email': message.reply_to[0]}

        if message.body:
            payload['textContent'] = message.body
        if html_content:
            payload['htmlContent'] = html_content

        if message.extra_headers:
            payload['headers'] = message.extra_headers

    @staticmethod
    def _process_attachments(attachments_list) -> list[dict]:
        processed = []
        EXPECTED_TUPLE_LEN = 3
        for attachment in attachments_list:
            if (
                not isinstance(attachment, tuple)
                or len(attachment) != EXPECTED_TUPLE_LEN
            ):
                logger.warning(
                    'Anexo ignorado por formato não suportado: %r', attachment
                )
                continue
            filename, content, _mimetype = attachment
            if isinstance(content, str):
                content = content.encode('utf-8')
            processed.append({
                'name': filename or 'attachment',
                'content': base64.b64encode(content).decode('ascii'),
            })
        return processed
