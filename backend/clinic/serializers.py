"""
Serializadores DRF con listas explícitas de campos y validaciones de integridad
para las entidades clínicas de PetCare.
"""

from django.utils import timezone
from rest_framework import serializers

from .models import Cita, FichaClinica, Mascota, Recordatorio, Tutor, Veterinario


class TutorSerializer(serializers.ModelSerializer):
    """Serializador para la entidad Tutor con validaciones básicas de integridad."""

    class Meta:
        model = Tutor
        fields = ['id', 'nombre', 'apellido', 'telefono', 'email', 'direccion']

    def validate_nombre(self, value):
        """Valida que el nombre del tutor no contenga únicamente espacios."""
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('El nombre no puede estar vacío.')
        return cleaned

    def validate_apellido(self, value):
        """Valida que el apellido del tutor no contenga únicamente espacios."""
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('El apellido no puede estar vacío.')
        return cleaned

    def validate_telefono(self, value):
        """Valida que el teléfono posea una longitud mínima válida."""
        cleaned = value.strip()
        digits = [ch for ch in cleaned if ch.isdigit()]
        if len(digits) < 7:
            raise serializers.ValidationError(
                'El teléfono debe contener al menos 7 dígitos.'
            )
        return cleaned


class MascotaSerializer(serializers.ModelSerializer):
    """Serializador para la entidad Mascota con validaciones de nombre y fecha."""

    class Meta:
        model = Mascota
        fields = ['id', 'tutor', 'nombre', 'especie', 'raza', 'fecha_nacimiento']

    def validate_nombre(self, value):
        """Valida que el nombre de la mascota no esté vacío."""
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError(
                'El nombre de la mascota no puede estar vacío.'
            )
        return cleaned

    def validate_fecha_nacimiento(self, value):
        """Impide registrar fechas de nacimiento futuras."""
        if value and value > timezone.localdate():
            raise serializers.ValidationError(
                'La fecha de nacimiento no puede ser posterior a la fecha actual.'
            )
        return value


class VeterinarioSerializer(serializers.ModelSerializer):
    """Serializador para la entidad Veterinario con nombre formateado calculado."""

    nombre = serializers.SerializerMethodField()

    class Meta:
        model = Veterinario
        fields = ['id', 'usuario', 'nombre', 'especialidad', 'telefono']

    def get_nombre(self, obj):
        """Compone el nombre completo con prefijo profesional para la respuesta JSON."""
        nombre_completo = f'{obj.usuario.first_name} {obj.usuario.last_name}'.strip()
        if nombre_completo:
            return f'Dr/a. {nombre_completo}'
        return obj.usuario.username


class CitaSerializer(serializers.ModelSerializer):
    """Serializador para la entidad Cita con prevención de solapamientos por veterinario."""

    class Meta:
        model = Cita
        fields = ['id', 'mascota', 'veterinario', 'fecha_hora', 'motivo', 'estado']

    def validate_motivo(self, value):
        """Valida que el motivo de la cita contenga contenido significativo."""
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('El motivo de la cita no puede estar vacío.')
        return cleaned

    def validate(self, attrs):
        """
        Impide agendar dos citas activas al mismo veterinario en idéntica fecha y hora.
        """
        veterinario = attrs.get(
            'veterinario',
            getattr(self.instance, 'veterinario', None),
        )
        fecha_hora = attrs.get(
            'fecha_hora',
            getattr(self.instance, 'fecha_hora', None),
        )
        estado = attrs.get(
            'estado',
            getattr(self.instance, 'estado', 'Pendiente'),
        )

        if estado != 'Cancelada' and veterinario is not None and fecha_hora is not None:
            solapadas = Cita.objects.filter(
                veterinario=veterinario,
                fecha_hora=fecha_hora,
            ).exclude(estado='Cancelada')

            if self.instance is not None:
                solapadas = solapadas.exclude(pk=self.instance.pk)

            if solapadas.exists():
                raise serializers.ValidationError({
                    'fecha_hora': (
                        'El veterinario ya posee una cita agendada '
                        'para esta fecha y hora.'
                    )
                })

        return attrs


class FichaClinicaSerializer(serializers.ModelSerializer):
    """Serializador para la Ficha Clínica incluyendo adjunto opcional."""

    class Meta:
        model = FichaClinica
        fields = [
            'id',
            'cita',
            'diagnostico',
            'tratamiento',
            'receta',
            'examenes',
            'documento_adjunto',
            'fecha_creacion',
        ]
        read_only_fields = ['fecha_creacion']


class RecordatorioSerializer(serializers.ModelSerializer):
    """Serializador para la entidad Recordatorio."""

    class Meta:
        model = Recordatorio
        fields = [
            'id',
            'mascota',
            'tipo',
            'descripcion',
            'fecha_programada',
            'completado',
        ]
