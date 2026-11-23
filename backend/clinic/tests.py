"""
Pruebas unitarias e integración API para autenticación JWT, RBAC de usuarios,
seguridad de contraseñas, operaciones CRUD y reglas de negocio del módulo clinic.
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Cita, Mascota, Tutor, Veterinario


class ClinicAPISecurityAndDomainTests(APITestCase):
    """Suite de pruebas para seguridad JWT, RBAC, hashing PBKDF2, CRUD y citas."""

    def setUp(self):
        """Crea usuario veterinario staff y datos base en entorno aislado de pruebas."""
        self.raw_password = 'VetSecurePassword2026!'
        self.user = User.objects.create_user(
            username='vet_test',
            email='vet@petcare.cl',
            password=self.raw_password,
            first_name='Camila',
            last_name='Rojas',
            is_staff=True,
        )
        self.veterinario = Veterinario.objects.create(
            usuario=self.user,
            especialidad='Medicina General',
            telefono='+56912345678',
        )

    def _authenticate(self, username=None, password=None):
        """Obtiene token JWT mediante /api/auth/login/ y lo inyecta en el cliente."""
        response = self.client.post(
            '/api/auth/login/',
            {
                'username': username or self.user.username,
                'password': password or self.raw_password,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data

    def test_health_endpoint_is_public(self):
        """Verifica que /api/health/ responde 200 sin autenticación."""
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {'status': 'ok', 'service': 'petcare-backend'},
        )

    def test_tutores_rejects_unauthenticated_request_with_401(self):
        """Verifica que /api/tutores/ rechace solicitudes sin token JWT con 401."""
        response = self.client.get('/api/tutores/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_stored_securely_with_pbkdf2_hasher(self):
        """Verifica que la contraseña no quede en texto plano e inicie con PBKDF2."""
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.password, self.raw_password)
        self.assertTrue(self.user.password.startswith('pbkdf2_sha256$'))
        self.assertTrue(self.user.check_password(self.raw_password))

    def test_jwt_login_me_and_crud_tutor_and_cita(self):
        """Valida login JWT, perfil /api/auth/me/ y ciclo CRUD completo en Tutor y Cita."""
        self._authenticate()

        me_response = self.client.get('/api/auth/me/')
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data['username'], 'vet_test')
        self.assertEqual(me_response.data['full_name'], 'Camila Rojas')
        self.assertTrue(me_response.data['is_staff'])

        tutor_payload = {
            'nombre': 'María',
            'apellido': 'Pérez',
            'telefono': '+56987654321',
            'email': 'maria.perez@example.cl',
            'direccion': 'Av. Providencia 1234',
        }
        create_tutor = self.client.post('/api/tutores/', tutor_payload, format='json')
        self.assertEqual(create_tutor.status_code, status.HTTP_201_CREATED)
        tutor_id = create_tutor.data['id']

        get_tutor = self.client.get(f'/api/tutores/{tutor_id}/')
        self.assertEqual(get_tutor.status_code, status.HTTP_200_OK)
        self.assertEqual(get_tutor.data['email'], 'maria.perez@example.cl')

        patch_tutor = self.client.patch(
            f'/api/tutores/{tutor_id}/',
            {'telefono': '+56911112222'},
            format='json',
        )
        self.assertEqual(patch_tutor.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_tutor.data['telefono'], '+56911112222')

        mascota = Mascota.objects.create(
            tutor_id=tutor_id,
            nombre='Luna',
            especie='Canino',
            raza='Mestizo',
        )

        fecha_cita = (timezone.now() + timedelta(days=1)).replace(
            second=0,
            microsecond=0,
        )
        cita_payload = {
            'mascota': mascota.id,
            'veterinario': self.veterinario.id,
            'fecha_hora': fecha_cita.isoformat(),
            'motivo': 'Control anual de vacunas',
            'estado': 'Pendiente',
        }
        create_cita = self.client.post('/api/citas/', cita_payload, format='json')
        self.assertEqual(create_cita.status_code, status.HTTP_201_CREATED)
        cita_id = create_cita.data['id']

        get_cita = self.client.get(f'/api/citas/{cita_id}/')
        self.assertEqual(get_cita.status_code, status.HTTP_200_OK)
        self.assertEqual(get_cita.data['estado'], 'Pendiente')

        patch_cita = self.client.patch(
            f'/api/citas/{cita_id}/',
            {'estado': 'Realizada'},
            format='json',
        )
        self.assertEqual(patch_cita.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_cita.data['estado'], 'Realizada')

        delete_cita = self.client.delete(f'/api/citas/{cita_id}/')
        self.assertEqual(delete_cita.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Cita.objects.filter(pk=cita_id).exists())

        delete_tutor = self.client.delete(f'/api/tutores/{tutor_id}/')
        self.assertEqual(delete_tutor.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Tutor.objects.filter(pk=tutor_id).exists())

    def test_overlapping_cita_same_veterinario_returns_400(self):
        """Rechaza con 400 dos citas activas del mismo veterinario en igual fecha_hora."""
        self._authenticate()

        tutor = Tutor.objects.create(
            nombre='Carlos',
            apellido='Soto',
            telefono='+56922223333',
            email='carlos.soto@example.cl',
        )
        mascota_a = Mascota.objects.create(tutor=tutor, nombre='Max', especie='Canino')
        mascota_b = Mascota.objects.create(tutor=tutor, nombre='Milo', especie='Felino')

        fecha_solapada = (timezone.now() + timedelta(days=2)).replace(
            second=0,
            microsecond=0,
        )

        primera = self.client.post(
            '/api/citas/',
            {
                'mascota': mascota_a.id,
                'veterinario': self.veterinario.id,
                'fecha_hora': fecha_solapada.isoformat(),
                'motivo': 'Consulta dermatológica',
                'estado': 'Pendiente',
            },
            format='json',
        )
        self.assertEqual(primera.status_code, status.HTTP_201_CREATED)

        duplicada = self.client.post(
            '/api/citas/',
            {
                'mascota': mascota_b.id,
                'veterinario': self.veterinario.id,
                'fecha_hora': fecha_solapada.isoformat(),
                'motivo': 'Control general',
                'estado': 'Pendiente',
            },
            format='json',
        )
        self.assertEqual(duplicada.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('fecha_hora', duplicada.data)

    def test_usuarios_rejects_unauthenticated_401_and_non_staff_403(self):
        """Verifica que /api/usuarios/ exija JWT (401) y rol staff (403)."""
        unauth_get = self.client.get('/api/usuarios/')
        self.assertEqual(unauth_get.status_code, status.HTTP_401_UNAUTHORIZED)

        unauth_post = self.client.post(
            '/api/usuarios/',
            {
                'username': 'nuevo_user',
                'email': 'nuevo@petcare.cl',
                'password': 'StrongPassword2026!',
            },
            format='json',
        )
        self.assertEqual(unauth_post.status_code, status.HTTP_401_UNAUTHORIZED)

        standard_password = 'StandardUserPass2026!'
        User.objects.create_user(
            username='recepcion_std',
            email='recepcion@petcare.cl',
            password=standard_password,
            is_staff=False,
        )
        self._authenticate(username='recepcion_std', password=standard_password)

        std_get = self.client.get('/api/usuarios/')
        self.assertEqual(std_get.status_code, status.HTTP_403_FORBIDDEN)

        std_post = self.client.post(
            '/api/usuarios/',
            {
                'username': 'intento_std',
                'email': 'intento@petcare.cl',
                'password': 'StrongPassword2026!',
            },
            format='json',
        )
        self.assertEqual(std_post.status_code, status.HTTP_403_FORBIDDEN)

    def test_usuarios_staff_create_validation_hashing_and_no_superuser(self):
        """
        Valida creación 201 por staff, hashing PBKDF2, no exposición de password,
        rechazo 400 de contraseñas débiles, bloqueo de is_superuser y control de is_active.
        """
        self._authenticate()

        weak_response = self.client.post(
            '/api/usuarios/',
            {
                'username': 'clave_debil',
                'email': 'debil@petcare.cl',
                'password': '123',
            },
            format='json',
        )
        self.assertEqual(weak_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', weak_response.data)

        strong_password = 'ClinicaVet#2026Safe!'
        create_response = self.client.post(
            '/api/usuarios/',
            {
                'username': 'dr_mendez',
                'first_name': 'Diego',
                'last_name': 'Méndez',
                'email': 'diego.mendez@petcare.cl',
                'password': strong_password,
                'is_staff': False,
                'is_superuser': True,
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('password', create_response.data)
        self.assertNotIn('is_superuser', create_response.data)
        self.assertFalse(create_response.data['tiene_perfil_veterinario'])

        created_user = User.objects.get(pk=create_response.data['id'])
        self.assertNotEqual(created_user.password, strong_password)
        self.assertTrue(created_user.password.startswith('pbkdf2_sha256$'))
        self.assertTrue(created_user.check_password(strong_password))
        self.assertFalse(created_user.is_superuser)
        self.assertFalse(created_user.is_staff)
        self.assertTrue(created_user.is_active)

        list_response = self.client.get('/api/usuarios/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        by_username = {item['username']: item for item in list_response.data}
        self.assertTrue(by_username['vet_test']['tiene_perfil_veterinario'])
        self.assertFalse(by_username['dr_mendez']['tiene_perfil_veterinario'])

        self_deactivate = self.client.patch(
            f'/api/usuarios/{self.user.id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(self_deactivate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('is_active', self_deactivate.data)

        other_deactivate = self.client.patch(
            f'/api/usuarios/{created_user.id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(other_deactivate.status_code, status.HTTP_200_OK)
        created_user.refresh_from_db()
        self.assertFalse(created_user.is_active)

    def test_veterinarios_usuarios_disponibles_filtering_and_incluir_usuario(self):
        """
        Verifica rechazo 401 sin token, filtrado de usuarios activos libres
        y soporte de ?incluir_usuario=<id> en /api/veterinarios/usuarios-disponibles/.
        """
        unauth = self.client.get('/api/veterinarios/usuarios-disponibles/')
        self.assertEqual(unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        libre_activo = User.objects.create_user(
            username='vet_disponible',
            first_name='Ana',
            last_name='Silva',
            email='ana.silva@petcare.cl',
            password='AnaSecurePassword2026!',
            is_active=True,
        )
        User.objects.create_user(
            username='vet_inactivo',
            email='inactivo@petcare.cl',
            password='InactivePassword2026!',
            is_active=False,
        )

        self._authenticate()

        response = self.client.get('/api/veterinarios/usuarios-disponibles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in response.data]
        self.assertEqual(returned_ids, [libre_activo.id])
        self.assertEqual(
            set(response.data[0].keys()),
            {'id', 'username', 'first_name', 'last_name', 'email'},
        )

        with_current = self.client.get(
            f'/api/veterinarios/usuarios-disponibles/?incluir_usuario={self.user.id}'
        )
        self.assertEqual(with_current.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['id'] for item in with_current.data],
            sorted([self.user.id, libre_activo.id]),
        )

        invalid_param = self.client.get(
            '/api/veterinarios/usuarios-disponibles/?incluir_usuario=no_entero'
        )
        self.assertEqual(invalid_param.status_code, status.HTTP_400_BAD_REQUEST)
