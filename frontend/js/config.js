/*
Configuración centralizada del cliente frontend PetCare.
En entorno local apunta al servidor Django local.
Al desplegar en AWS Academy, reemplazar API_BASE_URL por la URL base
del Stage publicado en Amazon API Gateway (sin barra final).
*/

export const APP_CONFIG = Object.freeze({
    API_BASE_URL: 'http://127.0.0.1:8000',
    S3_BRAND_ASSET_URL: '',
});
