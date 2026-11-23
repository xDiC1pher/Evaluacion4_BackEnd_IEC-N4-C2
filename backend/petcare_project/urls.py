"""
Configuración de rutas globales de la API REST PetCare.
Expone administración, verificación de salud, autenticación JWT y recursos clínicos.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from clinic.views import CurrentUserView, HealthCheckView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', HealthCheckView.as_view(), name='api_health'),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', CurrentUserView.as_view(), name='auth_me'),
    path('api/', include('clinic.urls')),
]

if settings.DEBUG and not settings.USE_S3:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

"""
Registro de interceptores globales de errores en formato JSON.
"""
handler404 = 'petcare_project.views.custom_404'
handler500 = 'petcare_project.views.custom_500'
