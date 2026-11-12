from rest_framework import permissions
from .models import UserRole

class DenyAll(permissions.BasePermission):
    def has_permission(self, request, view):
        return False

class IsNurse(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.NURSE)

class IsDoctor(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.DOCTOR)

class IsHeadDoctor(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.DOCTOR and request.user.is_head_doctor)

class IsAdminStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.ADMIN)

class IsHospitalManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.MANAGER)

class CanViewOccupancy(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

class CanViewReports(permissions.BasePermission):
    def has_permission(self, request, view):
        # Manager and Doctor can view mortality / reports
        return bool(request.user and request.user.is_authenticated and request.user.role in [UserRole.MANAGER, UserRole.DOCTOR])
