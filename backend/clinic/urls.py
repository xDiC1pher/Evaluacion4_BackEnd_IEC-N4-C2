"""
Enrutador principal de la API REST para el módulo clinic.
"""

from django.urls import include, path
from rest_framework import routers

from .views import (
    CitaViewSet,
    FichaClinicaViewSet,
    MascotaViewSet,
    RecordatorioViewSet,
    TutorViewSet,
    UsuarioViewSet,
    VeterinarioViewSet,
)

router = routers.DefaultRouter()
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'tutores', TutorViewSet)
router.register(r'mascotas', MascotaViewSet)
router.register(r'veterinarios', VeterinarioViewSet)
router.register(r'citas', CitaViewSet)
router.register(r'fichas', FichaClinicaViewSet)
router.register(r'recordatorios', RecordatorioViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
