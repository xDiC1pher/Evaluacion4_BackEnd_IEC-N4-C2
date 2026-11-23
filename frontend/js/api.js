/*
Cliente HTTP modular basado en Fetch API con soporte JWT, renovación automática
de access token, cargas Multipart FormData y telemetría de respuestas HTTP.
*/

import { APP_CONFIG } from './config.js';

const ACCESS_TOKEN_KEY = 'petcare_access_token';
const REFRESH_TOKEN_KEY = 'petcare_refresh_token';

let telemetryListener = null;
let unauthorizedListener = null;
let activeRefreshPromise = null;

/* Registra el callback encargado de actualizar la barra de telemetría HTTP. */
export function setTelemetryListener(callback) {
    telemetryListener = typeof callback === 'function' ? callback : null;
}

/* Registra el callback que se invoca cuando la sesión JWT expira o falla el refresh. */
export function setUnauthorizedListener(callback) {
    unauthorizedListener = typeof callback === 'function' ? callback : null;
}

export function getAccessToken() {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(access, refresh) {
    if (access) {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, access);
    }
    if (refresh) {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }
}

export function clearTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasSession() {
    return Boolean(getAccessToken());
}

/* Construye la URL absoluta sin duplicar barras respecto de API_BASE_URL. */
export function buildApiUrl(path) {
    let base = APP_CONFIG.API_BASE_URL;
    while (base.endsWith('/')) {
        base = base.slice(0, -1);
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}

/* Resuelve una URL segura de archivo adjunto (S3 prefirmada o media local). */
export function resolveSafeMediaUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return null;
    }
    try {
        const parsed = new URL(rawUrl, APP_CONFIG.API_BASE_URL);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
        return null;
    } catch (_error) {
        return null;
    }
}

function emitTelemetry(method, endpoint, status, message) {
    if (!telemetryListener) {
        return;
    }
    telemetryListener({
        method,
        endpoint,
        status,
        message,
        timestamp: new Date().toLocaleTimeString('es-CL', { hour12: false }),
    });
}

async function parseResponseBody(response) {
    if (response.status === 204) {
        return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return await response.json();
        } catch (_error) {
            return null;
        }
    }
    const text = await response.text();
    return text ? { detail: text } : null;
}

/* Formatea errores DRF (campos o detail) en texto legible sin usar HTML. */
export function formatApiError(data, fallbackMessage) {
    if (!data) {
        return fallbackMessage;
    }
    if (typeof data === 'string') {
        return data;
    }
    if (typeof data.detail === 'string') {
        return data.detail;
    }
    if (typeof data.message === 'string') {
        return data.message;
    }
    if (typeof data === 'object') {
        const parts = [];
        for (const [field, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                parts.push(`${field}: ${value.join(' ')}`);
            } else if (typeof value === 'string') {
                parts.push(`${field}: ${value}`);
            }
        }
        if (parts.length > 0) {
            return parts.join(' | ');
        }
    }
    return fallbackMessage;
}

/* Renueva el access token mediante el refresh token almacenado en sessionStorage. */
async function refreshAccessToken() {
    if (activeRefreshPromise) {
        return activeRefreshPromise;
    }

    const refresh = getRefreshToken();
    if (!refresh) {
        return false;
    }

    activeRefreshPromise = (async () => {
        try {
            const response = await fetch(buildApiUrl('/api/auth/refresh/'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({ refresh }),
            });
            const data = await parseResponseBody(response);
            emitTelemetry(
                'POST',
                '/api/auth/refresh/',
                response.status,
                response.ok ? 'Token JWT renovado automáticamente.' : 'Renovación JWT rechazada.'
            );

            if (!response.ok || !data || !data.access) {
                return false;
            }
            setTokens(data.access, data.refresh || refresh);
            return true;
        } catch (_error) {
            emitTelemetry('POST', '/api/auth/refresh/', 0, 'Error de red al renovar token JWT.');
            return false;
        } finally {
            activeRefreshPromise = null;
        }
    })();

    return activeRefreshPromise;
}

/*
Ejecuta una solicitud HTTP contra el backend PetCare con manejo automático
de JSON, FormData, autorización Bearer, renovación JWT ante 401 y telemetría.
*/
export async function apiRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const skipAuth = Boolean(options.skipAuth);
    const isRetry = Boolean(options._isRetry);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    let payload = options.body;
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    if (payload !== undefined && payload !== null && !isFormData && typeof payload !== 'string') {
        headers.set('Content-Type', 'application/json');
        payload = JSON.stringify(payload);
    }

    if (!skipAuth) {
        const access = getAccessToken();
        if (access) {
            headers.set('Authorization', `Bearer ${access}`);
        }
    }

    let response;
    try {
        response = await fetch(buildApiUrl(endpoint), {
            method,
            headers,
            body: payload,
        });
    } catch (_networkError) {
        emitTelemetry(method, endpoint, 0, 'Sin conexión con el servidor API.');
        const err = new Error('No fue posible conectar con el servidor API.');
        err.status = 0;
        throw err;
    }

    const data = await parseResponseBody(response);

    if (
        response.status === 401 &&
        !skipAuth &&
        !isRetry &&
        endpoint !== '/api/auth/login/' &&
        endpoint !== '/api/auth/refresh/'
    ) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            return apiRequest(endpoint, { ...options, _isRetry: true });
        }
        clearTokens();
        emitTelemetry(method, endpoint, 401, 'Sesión expirada. Inicie sesión nuevamente.');
        if (unauthorizedListener) {
            unauthorizedListener('Su sesión JWT ha expirado. Vuelva a autenticarse.');
        }
        const expiredErr = new Error('Sesión expirada.');
        expiredErr.status = 401;
        expiredErr.data = data;
        throw expiredErr;
    }

    let statusSummary = response.ok ? 'Solicitud completada.' : 'Solicitud rechazada.';
    if (response.status === 429) {
        statusSummary = '429 Too Many Requests: límite de tasa (throttling) alcanzado en API Gateway.';
    } else if (!response.ok) {
        statusSummary = formatApiError(data, `Error HTTP ${response.status}.`);
    }

    emitTelemetry(method, endpoint, response.status, statusSummary);

    if (!response.ok) {
        const apiError = new Error(statusSummary);
        apiError.status = response.status;
        apiError.data = data;
        throw apiError;
    }

    return {
        status: response.status,
        data,
    };
}

export async function login(username, password) {
    const result = await apiRequest('/api/auth/login/', {
        method: 'POST',
        skipAuth: true,
        body: { username, password },
    });
    setTokens(result.data.access, result.data.refresh);
    return result.data;
}

export async function fetchCurrentUser() {
    const result = await apiRequest('/api/auth/me/', { method: 'GET' });
    return result.data;
}

export async function checkApiHealth() {
    return apiRequest('/api/health/', { method: 'GET', skipAuth: true });
}
