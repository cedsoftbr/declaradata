import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from apps.core.exceptions import BusinessError

logger = logging.getLogger('apps.core')


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None and isinstance(exc, BusinessError):
        view = context.get('view')
        logger.error(
            'BusinessError em %s.%s: %s',
            view.__class__.__name__ if view else 'unknown',
            getattr(view, 'action', ''),
            exc,
            exc_info=exc,
        )
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    return response
