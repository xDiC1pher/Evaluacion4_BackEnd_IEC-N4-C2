# PetCare Frontend — Cliente Web Independiente (Evaluación 4)

Aplicación estática en **HTML5 + CSS + JavaScript modular (ES Modules)**, sin dependencias ni CDNs externos, diseñada para consumir la API REST JWT de PetCare y cumplir con buenas prácticas evaluadas en **OWASP ZAP** (sin scripts inline, sin estilos inline, sin `innerHTML` con datos de la API, tokens en `sessionStorage` y cabeceras estrictas en Nginx).

---

## Estructura de Archivos
- `frontend/index.html`: Interfaz responsiva con vista de Login JWT, barra de telemetría HTTP y 6 módulos CRUD.
- `frontend/css/styles.css`: Tema clínico en azul petróleo y gris pizarra.
- `frontend/js/config.js`: Configuración centralizada (`API_BASE_URL` y `S3_BRAND_ASSET_URL`).
- `frontend/js/api.js`: Cliente HTTP `fetch` con Bearer JWT, refresh automático ante `401`, soporte JSON/`FormData` y telemetría HTTP (incluyendo detección explícita de `429 Too Many Requests`).
- `frontend/js/app.js`: Controlador modular DOM (`createElement`/`textContent` + `addEventListener`) para Tutores, Mascotas, Veterinarios, Citas, Fichas Clínicas (con adjuntos S3/Media) y Recordatorios.
- `frontend/nginx.conf`: Plantilla de servidor web endurecido para EC2 Ubuntu/Nginx.

---

## Ejecución Local (Desarrollo y Pruebas)

1. Iniciar el backend Django en `http://127.0.0.1:8000` (con `CORS_ALLOWED_ORIGINS` incluyendo `http://127.0.0.1:8080,http://localhost:8080` en `backend/.env`):
   ```powershell
   backend\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
   ```
2. Servir el frontend estático desde la raíz del monorepo en el puerto `8080`:
   ```powershell
   python -m http.server 8080 --directory frontend
   ```
3. Abrir en el navegador:
   - `http://127.0.0.1:8080` o `http://localhost:8080`

---

## Configuración para Despliegue en AWS Academy (EC2 + Nginx + API Gateway)

1. Editar únicamente `frontend/js/config.js` antes de copiar los archivos a `/var/www/petcare-frontend`:
   ```javascript
   export const APP_CONFIG = Object.freeze({
       API_BASE_URL: 'https://<api-id>.execute-api.us-east-1.amazonaws.com/prod',
       S3_BRAND_ASSET_URL: '',
   });
   ```
2. En la instancia EC2 Frontend (Ubuntu + Nginx):
   - Copiar `index.html`, `css/` y `js/` hacia `/var/www/petcare-frontend/`.
   - Instalar `frontend/nginx.conf` en `/etc/nginx/sites-available/petcare-frontend`, ajustar `connect-src` en la cabecera `Content-Security-Policy` al dominio exacto de API Gateway si se requiere restricción adicional, habilitar el sitio en `sites-enabled/` y recargar Nginx (`sudo nginx -t && sudo systemctl reload nginx`).
3. En el backend EC2 (`backend/.env`), incluir el origen público de la instancia EC2 Frontend dentro de `CORS_ALLOWED_ORIGINS`.
