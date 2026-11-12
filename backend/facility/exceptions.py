from rest_framework.views import exception_handler
from rest_framework import status
from rest_framework.exceptions import PermissionDenied

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        if response.status_code == status.HTTP_403_FORBIDDEN:
            response.data = {'detail': 'You do not have permission to do this.'}

    return response
