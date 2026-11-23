# PetCare Backend — API REST Clínica Veterinaria (Evaluación 4)

API REST pura construida con **Django** y **Django REST Framework**, desacoplada de plantillas HTML, autenticada mediante **JWT (SimpleJWT)** y preparada para despliegue en **AWS Academy** (EC2 con `LabInstanceProfile`, Amazon RDS PostgreSQL con TLS, Amazon S3 con cifrado SSE-S3 y Amazon API Gateway).

---

## Arquitectura y Seguridad Implementada
- **Autenticación y Autorización:** `JWTAuthentication` y `IsAuthenticated` como política global en DRF. Tokens `access` (60 min) y `refresh` (1 día, con rotación habilitada).
- **Hashing de Contraseñas:** `PASSWORD_HASHERS` declarado explícitamente con `PBKDF2PasswordHasher` como algoritmo principal.
- **CORS:** Controlado vía `django-cors-headers` usando lista explícita `CORS_ALLOWED_ORIGINS`.
- **Cabeceras de Endurecimiento:** `SECURE_CONTENT_TYPE_NOSNIFF=True`, `X_FRAME_OPTIONS='DENY'`, y activación condicional de `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` y `SECURE_HSTS_SECONDS` mediante `SECURE_HTTPS_ONLY=True`.
- **Base de Datos:** PostgreSQL con `sslmode=require` condicional (`DB_SSL_REQUIRE=True`) para Amazon RDS, y modo SQLite local (`USE_SQLITE=True`) para pruebas rápidas.
- **Almacenamiento S3:** Integración mediante `django-storages` + `boto3` (`storages.backends.s3.S3Storage`) cuando `USE_S3=True`, con cifrado `AES256` (`SSE-S3`), URLs prefirmadas (`AWS_QUERYSTRING_AUTH=True`) y autenticación vía IAM Role (sin llaves estáticas).

---

## Variables de Entorno
Copiar `backend/.env.example` a `backend/.env` y definir valores según el entorno:

| Variable | Descripción | Ejemplo Local | Ejemplo Producción (AWS) |
| --- | --- | --- | --- |
| `SECRET_KEY` | Clave criptográfica obligatoria de Django | *(clave aleatoria fuerte)* | *(clave aleatoria fuerte)* |
| `DEBUG` | Modo depuración (deshabilita Browsable API en `False`) | `True` | `False` |
| `ALLOWED_HOSTS` | Lista de hosts permitidos separados por coma (sin `*`) | `127.0.0.1,localhost` | `ec2-host,api.dominio.com` |
| `CORS_ALLOWED_ORIGINS` | Orígenes frontend autorizados separados por coma | `http://127.0.0.1:5500,http://localhost:5500` | `http://<ec2-frontend>` |
| `USE_SQLITE` | Usa SQLite local si es `True`; PostgreSQL si es `False` | `True` | `False` |
| `DB_NAME` | Nombre de la base de datos PostgreSQL | `petcare_db` | `petcare_db` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` | `petcare_admin` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | *(vacío en SQLite)* | *(contraseña segura)* |
| `DB_HOST` | Host o endpoint de Amazon RDS | `localhost` | `<endpoint>.rds.amazonaws.com` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` | `5432` |
| `DB_SSL_REQUIRE` | Exige `sslmode=require` en PostgreSQL | `False` | `True` |
| `USE_S3` | Habilita `S3Storage` para archivos media | `False` | `True` |
| `AWS_STORAGE_BUCKET_NAME` | Nombre del bucket S3 privado | *(vacío)* | `petcare-clinical-bucket` |
| `AWS_S3_REGION_NAME` | Región AWS del bucket S3 | `us-east-1` | `us-east-1` |
| `SECURE_HTTPS_ONLY` | Activa cookies seguras y HSTS | `False` | `True` *(tras HTTPS)* |

---

## Endpoints de la API

### Salud y Autenticación
- `GET /api/health/` — Público (`AllowAny`). Retorna `{"status": "ok", "service": "petcare-backend"}`.
- `POST /api/auth/login/` — Obtiene par de tokens JWT (`access`, `refresh`).
- `POST /api/auth/refresh/` — Renueva y rota tokens JWT.
- `GET /api/auth/me/` — Requiere `Bearer <access>`. Retorna perfil del usuario autenticado (`id`, `username`, `email`, `full_name`, `is_staff`).

### Recursos Clínicos (Todos requieren `Authorization: Bearer <access>`)
- `/api/tutores/` — CRUD completo de tutores.
- `/api/mascotas/` — CRUD completo de mascotas.
- `/api/veterinarios/` — CRUD completo de veterinarios.
- `/api/citas/` — CRUD completo de citas (con validación anti-solapamiento por veterinario y `fecha_hora`).
- `/api/fichas/` — CRUD completo de fichas clínicas (soporta `multipart/form-data` para `documento_adjunto`).
- `/api/recordatorios/` — CRUD completo de recordatorios.

---

## Ejecución Local (Desarrollo y Pruebas)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py check
python manage.py migrate
python manage.py test
python manage.py runserver
```

## Ejecución Productiva (Gunicorn en EC2)

```bash
source .venv/bin/activate
python manage.py migrate --noinput
python manage.py collectstatic --noinput
gunicorn petcare_project.wsgi:application --bind 0.0.0.0:8000 --workers 3
```
