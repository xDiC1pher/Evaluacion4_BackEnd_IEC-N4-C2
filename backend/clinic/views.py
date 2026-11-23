"""
Vistas y ViewSets de la API REST pura para el módulo clinic de PetCare.
"""

from rest_framework import viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cita, FichaClinica, Mascota, Recordatorio, Tutor, Veterinario
from .serializers import (
    CitaSerializer,
    FichaClinicaSerializer,
    MascotaSerializer,
    RecordatorioSerializer,
    TutorSerializer,
    VeterinarioSerializer,
)


class HealthCheckView(APIView):
    """Endpoint público de salud para monitoreo y pruebas de throttling en API Gateway."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """Retorna el estado operativo del servicio backend."""
        return Response({'status': 'ok', 'service': 'petcare-backend'})


class CurrentUserView(APIView):
    """Endpoint autenticado que retorna el perfil del usuario asociado al token JWT."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Retorna metadatos básicos del usuario autenticado."""
        user = request.user
        full_name = f'{user.first_name} {user.last_name}'.strip()
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'full_name': full_name or user.username,
            'is_staff': user.is_staff,
        })


class TutorViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para la entidad Tutor."""

    queryset = Tutor.objects.all().order_by('id')
    serializer_class = TutorSerializer
    permission_classes = [IsAuthenticated]


class MascotaViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para la entidad Mascota."""

    queryset = Mascota.objects.select_related('tutor').all().order_by('id')
    serializer_class = MascotaSerializer
    permission_classes = [IsAuthenticated]


class VeterinarioViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para la entidad Veterinario."""

    queryset = Veterinario.objects.select_related('usuario').all().order_by('id')
    serializer_class = VeterinarioSerializer
    permission_classes = [IsAuthenticated]


class CitaViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para la entidad Cita."""

    queryset = Cita.objects.select_related('mascota', 'veterinario').all().order_by('fecha_hora')
    serializer_class = CitaSerializer
    permission_classes = [IsAuthenticated]


class FichaClinicaViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para FichaClinica con soporte multiparte para adjuntos."""

    queryset = FichaClinica.objects.select_related('cita').all().order_by('-fecha_creacion')
    serializer_class = FichaClinicaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]


class RecordatorioViewSet(viewsets.ModelViewSet):
    """ViewSet CRUD autenticado para la entidad Recordatorio."""

    queryset = Recordatorio.objects.select_related('mascota').all().order_by('fecha_programada')
    serializer_class = RecordatorioSerializer
    permission_classes = [IsAuthenticated]
