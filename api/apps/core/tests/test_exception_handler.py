from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.exception_handler import custom_exception_handler
from apps.core.exceptions import BusinessError


def test_custom_exception_handler_validation_error():
    exc = ValidationError({'field': ['error message']})
    context = {}
    response = custom_exception_handler(exc, context)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'field' in response.data


def test_custom_exception_handler_permission_denied():
    exc = PermissionDenied('No access')
    context = {}
    response = custom_exception_handler(exc, context)
    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data['detail'] == 'No access'


def test_custom_exception_handler_business_error():
    exc = BusinessError('Logic error')
    context = {}
    response = custom_exception_handler(exc, context)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data['detail'] == 'Logic error'


def test_custom_exception_handler_other_error():
    # Django-style exception or other
    exc = Exception('Generic error')
    context = {}
    # DRF handler returns None for non-API exceptions
    response = custom_exception_handler(exc, context)
    assert response is None
