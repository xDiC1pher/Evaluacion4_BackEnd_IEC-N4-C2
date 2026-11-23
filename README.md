# PetCare Hub — Evaluación 4 Programación Backend (Arquitectura AWS)

Sistema de Gestión Clínica Veterinaria (**PetCare Hub**) desacoplado en una API REST pura con **Django 6 + Django REST Framework + JWT** y un cliente web estático en **HTML5 + CSS + JavaScript modular (Vanilla JS)**, endurecido bajo criterios OWASP/SAST y desplegado sobre **AWS Academy (`us-east-1`)**.

---

## Estructura del Monorepo

- [`backend/`](backend/README.md): API REST pura (Django 6, DRF, SimpleJWT, CORS, `django-storages`/`boto3`, Gunicorn y suite de pruebas automatizadas).
- [`frontend/`](frontend/README.md): Cliente web independiente sin dependencias ni CDNs externos, preparado para Nginx con CSP estricta.
- `docs/`: Capturas de evidencias de análisis estático SAST (SonarQube), análisis dinámico DAST (OWASP ZAP, incluyendo reporte HTML en `docs/zap/`), aprovisionamiento AWS, observabilidad CloudWatch, seguridad S3/RDS/PBKDF2 y pruebas en producción.

---

## Arquitectura Desplegada en AWS (`us-east-1`)

```text
Navegador Cliente
   │
   ├──► EC2 Frontend (petcare-ec2-frontend) [Nginx endurecido + CSP estricta]
   │        └── Sirve HTML5 / CSS / JS modular (sin dependencias externas)
   │
   └──► Amazon API Gateway (petcare-eva4-api) [HTTP API HTTPS · ANY /{proxy+} · Throttling 10 req/s, burst 15]
            └──► EC2 Backend (petcare-ec2-backend) [Nginx sin server_tokens + Gunicorn systemd + Django/DRF]
                     ├──► Amazon RDS PostgreSQL (petcare-rds-postgres) [Privado · Cifrado en reposo · Backups · TLS]
                     └──► Amazon S3 (petcare-eva4-jose-2026) [Privado · Block Public Access · SSE-S3 · IAM LabRole]
```

### Componentes Productivos
- **EC2 Backend (`petcare-ec2-backend`)**: Servidor de aplicaciones Django 6 + DRF ejecutado con **Gunicorn** gestionado por `systemd` detrás de **Nginx** endurecido (`server_tokens off` y cabeceras HTTP de seguridad). Consume configuración externa mediante variables de entorno (`.env` fuera de Git).
- **EC2 Frontend (`petcare-ec2-frontend`)**: Cliente web en **Vanilla JS** (ES Modules, cero frameworks ni CDNs externos) servido por **Nginx** con `Content-Security-Policy` estricta (sin `'unsafe-inline'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`.
- **Amazon RDS PostgreSQL (`petcare-rds-postgres`)**: Instancia PostgreSQL privada con cifrado en reposo, respaldos automáticos habilitados, instantánea manual verificada (`petcare-eva4-snapshot-manual`), conexión TLS (`sslmode=require`) y acceso de red restringido exclusivamente al Security Group del Backend.
- **Amazon S3 (`petcare-eva4-jose-2026`)**: Bucket privado con *Block Public Access* activado, versionado habilitado y cifrado del lado del servidor `SSE-S3` (`AES256`). Los adjuntos de fichas clínicas se cargan y entregan mediante **URLs prefirmadas** autenticadas vía rol IAM de instancia (**`LabRole`**), sin llaves estáticas en código ni en `.env`.
- **Amazon API Gateway (`petcare-eva4-api`)**: HTTP API publicada sobre **HTTPS** con ruta comodín `ANY /{proxy+}` hacia el Backend y *throttling* activo (**10 req/s**, ráfaga **15**), validado con respuestas `429 Too Many Requests`.
- **Observabilidad y Alertas (Amazon CloudWatch)**: Monitoreo activo de métricas EC2 (`CPUUtilization` y catálogo disponible) sobre `petcare-ec2-backend`, respaldado por la alarma `petcare-ec2-backend-high-cpu` (umbral estático `CPUUtilization > 70%` durante 1 punto de datos en 5 minutos).

---

## Seguridad, Autenticación JWT y Módulo RBAC

- **Autenticación JWT (`SimpleJWT`)**: Política global `JWTAuthentication` + `IsAuthenticated` en DRF. El frontend almacena tokens en `sessionStorage`, renueva automáticamente vía `/api/auth/refresh/` ante `401` y expone telemetría HTTP en vivo (incluyendo `401` y `429`).
- **Gestión de Usuarios (RBAC) — `/api/usuarios/`**:
  - Restringido estrictamente a usuarios autenticados con rol Staff Clínico (`is_staff=True` mediante `IsAuthenticated` + `IsAdminUser`; retorna `401 Unauthorized` sin token y `403 Forbidden` a usuarios estándar).
  - Permite listar (`GET`), crear (`POST`) y alternar estado `is_active` (`PATCH` acotado que impide al usuario autenticado desactivar su propia cuenta).
  - Contraseñas validadas con `validate_password` de Django, almacenadas exclusivamente con hashing **PBKDF2-SHA256** (`pbkdf2_sha256`, 1.500.000 iteraciones y *salt* único, verificado directamente en PostgreSQL para `vetadmin` y `dr.fuentes`), nunca devueltas en JSON (`write_only=True`) y con bloqueo explícito de escalamiento a `is_superuser`.
  - Pestaña **Usuarios** visible en el frontend únicamente cuando el perfil `/api/auth/me/` confirma `is_staff=True`.
- **Selector Dinámico en Veterinarios — `/api/veterinarios/usuarios-disponibles/`**:
  - Acción `GET` protegida por JWT que entrega campos no sensibles (`id`, `username`, `first_name`, `last_name`, `email`) de usuarios activos que aún no poseen perfil de `Veterinario`, ordenados por `id`.
  - Soporta el parámetro opcional `?incluir_usuario=<id>` (validado como entero) para conservar al usuario actual en modo edición.
  - Sincronizado automáticamente en el `<select>` de Veterinarios al iniciar sesión, sincronizar datos, crear usuarios o modificar perfiles veterinarios.
- **Endurecimiento Frontend y Validación DAST (OWASP ZAP 2.17.0 / CSP)**: Cero scripts o estilos inline, cero manejadores `onclick`/`onsubmit`, y construcción exclusiva de contenido dinámico mediante `document.createElement` y `textContent`. Escaneo dinámico sobre `http://3.208.9.218` con resultado **0 Alto**, **1 Medio** (`CSP: Directiva Wildcard`), **0 Bajo** y **3 Informativo**.

---

## Ejecución Local y Pruebas

### Backend (modo local SQLite)
1. Crear y configurar `backend/.env` a partir de [`backend/.env.example`](backend/.env.example) utilizando valores locales de ejemplo (`SECRET_KEY=<clave-aleatoria-fuerte>`, `USE_SQLITE=True`, `USE_S3=False`, `DB_PASSWORD=<password-local>`).
2. Ejecutar verificaciones y suite de pruebas automatizadas:
   ```powershell
   backend\.venv\Scripts\python.exe backend\manage.py check
   backend\.venv\Scripts\python.exe backend\manage.py migrate
   backend\.venv\Scripts\python.exe backend\manage.py test clinic -v 2
   backend\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
   ```

### Frontend
Servir los archivos estáticos localmente en el puerto `8080` (ver detalle de despliegue AWS en [`frontend/README.md`](frontend/README.md)):
```powershell
python -m http.server 8080 --directory frontend
```

---

## Evidencias de Despliegue y Seguridad

### Análisis Estático SAST (SonarQube Cloud)

| # | Evidencia | Descripción | Archivo |
| :-: | --- | --- | --- |
| 1 | Resumen SAST inicial | Métricas iniciales de SonarQube Cloud antes de la remediación | [sast_01_summary_antes.png](docs/sast_01_summary_antes.png) |
| 2 | Detalle de hallazgos | 2 issues reales detectados en `frontend/js/api.js` (ReDoS) y `frontend/js/app.js` (promesa flotante) | [sast_02_issues_antes.png](docs/sast_02_issues_antes.png) |
| 3 | Resumen SAST remediado | Verificación post-remediación con Quality Gate aprobado y 0 issues pendientes | [sast_03_summary_despues.png](docs/sast_03_summary_despues.png) |

### Infraestructura, Seguridad y Almacenamiento AWS (`us-east-1`)

| # | Evidencia | Descripción | Archivo |
| :-: | --- | --- | --- |
| 4 | Security Group de RDS | Reglas de entrada restringidas por Security Group hacia PostgreSQL (puerto 5432) | [aws_01_sg_rds.png](docs/aws_01_sg_rds.png) |
| 5 | Conectividad RDS | Configuración de red privada y estado operativo de `petcare-rds-postgres` | [aws_02_rds_connectivity.png](docs/aws_02_rds_connectivity.png) |
| 6 | Cifrado en reposo RDS | Confirmación de cifrado en reposo habilitado en `petcare-rds-postgres` | [aws_03a_rds_cifrado.png](docs/aws_03a_rds_cifrado.png) |
| 7 | Respaldos automáticos RDS | Configuración de retención y respaldos automáticos en Amazon RDS | [aws_03b_rds_backups.png](docs/aws_03b_rds_backups.png) |
| 8 | Versionado S3 | Versionado de objetos habilitado en el bucket `petcare-eva4-jose-2026` | [aws_04a_s3_versionado.png](docs/aws_04a_s3_versionado.png) |
| 9 | Cifrado S3 | Cifrado por defecto `SSE-S3` (`AES256`) en `petcare-eva4-jose-2026` | [aws_04b_s3_cifrado.png](docs/aws_04b_s3_cifrado.png) |
| 10 | Permisos S3 | *Block Public Access* activado completamente sobre el bucket privado | [aws_04c_s3_permisos.png](docs/aws_04c_s3_permisos.png) |
| 11 | Instancias EC2 | Instancias `petcare-ec2-backend` y `petcare-ec2-frontend` en ejecución | [aws_05_ec2_instancias.png](docs/aws_05_ec2_instancias.png) |
| 12 | Throttling API Gateway | Límites configurados en `petcare-eva4-api` (`10 req/s`, ráfaga `15`) | [aws_06a_apigw_throttling.png](docs/aws_06a_apigw_throttling.png) |
| 13 | Etapa API Gateway | Stage publicado sobre HTTPS con enrutamiento `ANY /{proxy+}` | [aws_06b_apigw_etapa.png](docs/aws_06b_apigw_etapa.png) |

### Validación Funcional, Adjuntos S3 y Controles HTTP en Producción

| # | Evidencia | Descripción | Archivo |
| :-: | --- | --- | --- |
| 14 | Frontend en producción | Aplicación PetCare Hub operando en vivo desde `petcare-ec2-frontend` | [aws_07_frontend_vivo.png](docs/aws_07_frontend_vivo.png) |
| 15 | Cabeceras de seguridad y CORS | Inspección de cabeceras CSP, `X-Frame-Options`, `nosniff`, `Permissions-Policy` y CORS | [aws_08_headers_cors.png](docs/aws_08_headers_cors.png) |
| 16 | Trazabilidad API Gateway | Respuesta HTTPS con identificador `Apigw-Requestid` desde `petcare-eva4-api` | [api_requestid.png](docs/api_requestid.png) |
| 17 | Propiedades de objeto S3 | Metadatos de objeto clínico almacenado en S3 con cifrado `SSE-S3` | [aws_10_s3_objeto_cifrado_objeto.png](docs/aws_10_s3_objeto_cifrado_objeto.png) |
| 18 | Objeto cifrado en S3 | Confirmación de almacenamiento cifrado de adjunto de ficha clínica en S3 | [aws_10a_s3_objeto_cifrado.png](docs/aws_10a_s3_objeto_cifrado.png) |
| 19 | Acceso directo denegado S3 | Rechazo `AccessDenied` al intentar abrir directamente la URL del objeto S3 | [aws_10b_s3_acceso_directo_denegado.png](docs/aws_10b_s3_acceso_directo_denegado.png) |
| 20 | Descarga autorizada S3 | Acceso controlado al adjunto clínico mediante URL prefirmada generada vía `LabRole` | [aws_10c_s3_adjunto_autorizado.png](docs/aws_10c_s3_adjunto_autorizado.png) |
| 21 | Pruebas HTTP 401 y 429 | Verificación en vivo de rechazo `401 Unauthorized` sin JWT y `429 Too Many Requests` por *throttling* | [aws_11_pruebas_401_429.png](docs/aws_11_pruebas_401_429.png) |

### Respaldos Manuales, Observabilidad CloudWatch, Hashing PBKDF2 y Análisis Dinámico DAST

| # | Evidencia | Descripción | Archivo |
| :-: | --- | --- | --- |
| 22 | Snapshot manual RDS | Instantánea manual `petcare-eva4-snapshot-manual` creada sobre `petcare-rds-postgres` | [aws_12_rds_snapshot_manual.png](docs/aws_12_rds_snapshot_manual.png) |
| 23 | Métricas CloudWatch EC2 | Monitoreo de métricas EC2 (`CPUUtilization` y catálogo disponible) de `petcare-ec2-backend` en Amazon CloudWatch | [aws_13_cloudwatch_metricas.png](docs/aws_13_cloudwatch_metricas.png) |
| 24 | Alarma CloudWatch EC2 | Alarma `petcare-ec2-backend-high-cpu` (`CPUUtilization > 70%` durante 1 punto de datos en 5 minutos) | [aws_14_cloudwatch_alarma.png](docs/aws_14_cloudwatch_alarma.png) |
| 25 | Verificación PBKDF2 en PostgreSQL | Almacenamiento seguro con `pbkdf2_sha256` (1.500.000 iteraciones y *salt* único) para `vetadmin` y `dr.fuentes` | [aws_15_pbkdf2_hash.png](docs/aws_15_pbkdf2_hash.png) |
| 26 | Captura reporte OWASP ZAP | Escaneo DAST con OWASP ZAP 2.17.0 sobre `http://3.208.9.218` (0 Alto, 1 Medio `CSP: Directiva Wildcard`, 0 Bajo, 3 Informativo) | [dast_01_zap_reporte.png](docs/dast_01_zap_reporte.png) |
| 27 | Reporte HTML OWASP ZAP | Reporte HTML completo generado por OWASP ZAP 2.17.0 para `http://3.208.9.218` | [2026-11-23-ZAP-Report-.html](docs/zap/2026-11-23-ZAP-Report-.html) |
