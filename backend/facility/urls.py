from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LoginView, CurrentUserView, DashboardSummaryView,
    PatientRegistrationView, AdmissionViewSet, TemperatureReadingViewSet,
    DoctorVisitViewSet, RoomViewSet, WaitingListViewSet,
    SystemSettingView, ReportsView, AcknowledgeAlertView,
    ExportCsvReportsView, AuditLogViewSet, UserManagementViewSet
)

router = DefaultRouter()
router.register(r'admissions', AdmissionViewSet, basename='admission')
router.register(r'temperatures', TemperatureReadingViewSet, basename='temperature')
router.register(r'visits', DoctorVisitViewSet, basename='visit')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'waiting-list', WaitingListViewSet, basename='waiting-list')
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')
router.register(r'users', UserManagementViewSet, basename='user')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/me/', CurrentUserView.as_view(), name='current-user'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('patients/register/', PatientRegistrationView.as_view(), name='patient-register'),
    path('settings/', SystemSettingView.as_view(), name='system-settings'),
    path('reports/', ReportsView.as_view(), name='reports'),
    path('reports/acknowledge_alert/', AcknowledgeAlertView.as_view(), name='acknowledge-alert'),
    path('reports/export_csv/', ExportCsvReportsView.as_view(), name='export-csv'),
    path('', include(router.urls)),
]
