"""
Vistas y ViewSets de la API REST pura para el módulo clinic de PetCare.
"""

from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cita, FichaClinica, Mascota, Recordatorio, Tutor, Veterinario
from .serializers import (
    CitaSerializer,
    FichaClinicaSerializer,
    MascotaSerializer,
    RecordatorioSerializer,
    TutorSerializer,
    UsuarioDisponibleSerializer,
    UsuarioEstadoSerializer,
    UsuarioSerializer,
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


class UsuarioViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet RBAC para gestión de usuarios exclusivamente por Staff Clínico.
    Permite listar (GET), crear (POST) y alternar is_active (PATCH).
    """

    queryset = User.objects.select_related('veterinario').all().order_by('id')
    permission_classes = [IsAuthenticated, IsAdminUser]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_class(self):
        """Restringe PATCH únicamente al cambio controlado de estado is_active."""
        if self.action == 'partial_update':
            return UsuarioEstadoSerializer
        return UsuarioSerializer


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

    @action(detail=False, methods=['get'], url_path='usuarios-disponibles')
    def usuarios_disponibles(self, request):
        """
        Retorna usuarios activos no vinculados a un Veterinario, ordenados por ID.
        Admite ?incluir_usuario=<id> para conservar el usuario actual en modo edición.
        """
        incluir_raw = request.query_params.get('incluir_usuario')
        incluir_id = None
        if incluir_raw is not None and incluir_raw != '':
            try:
                incluir_id = int(incluir_raw)
            except (TypeError, ValueError):
                return Response(
                    {'incluir_usuario': 'El parámetro incluir_usuario debe ser un entero válido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        filtro = Q(is_active=True, veterinario__isnull=True)
        if incluir_id is not None:
            filtro = filtro | Q(pk=incluir_id)

        usuarios = User.objects.filter(filtro).distinct().order_by('id')
        serializer = UsuarioDisponibleSerializer(usuarios, many=True)
        return Response(serializer.data)


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
