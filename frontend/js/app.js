/*
Controlador modular de interfaz del Sistema de Gestión Clínica Veterinaria PetCare.
Construye todos los nodos DOM mediante document.createElement y textContent,
y registra todos los eventos con addEventListener sin inyección HTML ni handlers inline.
*/

import { APP_CONFIG } from './config.js';
import {
    apiRequest,
    checkApiHealth,
    clearTokens,
    fetchCurrentUser,
    formatApiError,
    hasSession,
    login,
    resolveSafeMediaUrl,
    setTelemetryListener,
    setUnauthorizedListener,
} from './api.js';

const state = {
    user: null,
    activeTab: 'tutores',
    tutores: [],
    mascotas: [],
    veterinarios: [],
    citas: [],
    fichas: [],
    recordatorios: [],
    pendingConfirmAction: null,
};

const el = {
    brandLogo: document.getElementById('brandLogo'),
    apiBaseBadge: document.getElementById('apiBaseBadge'),
    btnHealthCheck: document.getElementById('btnHealthCheck'),
    userStatusBox: document.getElementById('userStatusBox'),
    userNameDisplay: document.getElementById('userNameDisplay'),
    userRoleBadge: document.getElementById('userRoleBadge'),
    btnLogout: document.getElementById('btnLogout'),

    telemetryMethod: document.getElementById('telemetryMethod'),
    telemetryEndpoint: document.getElementById('telemetryEndpoint'),
    telemetryStatus: document.getElementById('telemetryStatus'),
    telemetryTime: document.getElementById('telemetryTime'),
    telemetryMessage: document.getElementById('telemetryMessage'),

    globalAlert: document.getElementById('globalAlert'),
    globalAlertText: document.getElementById('globalAlertText'),
    btnCloseAlert: document.getElementById('btnCloseAlert'),

    loginSection: document.getElementById('loginSection'),
    loginForm: document.getElementById('loginForm'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),

    appSection: document.getElementById('appSection'),
    btnRefreshAll: document.getElementById('btnRefreshAll'),
    tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
    tabPanels: Array.from(document.querySelectorAll('.tab-panel')),

    confirmModal: document.getElementById('confirmModal'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalMessage: document.getElementById('confirmModalMessage'),
    btnConfirmCancel: document.getElementById('btnConfirmCancel'),
    btnConfirmAccept: document.getElementById('btnConfirmAccept'),
};

/* Utilidades seguras de manipulación DOM */
function setVisible(node, visible) {
    if (!node) {
        return;
    }
    node.hidden = !visible;
    node.classList.toggle('is-hidden', !visible);
}

function clearChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function createTextCell(text) {
    const td = document.createElement('td');
    td.textContent = text !== null && text !== undefined && text !== '' ? String(text) : '—';
    return td;
}

function createBadge(text, variant) {
    const span = document.createElement('span');
    span.className = `badge badge-${variant}`;
    span.textContent = text;
    return span;
}

function createActionButton(label, variant, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm btn-${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderEmptyRow(tbody, colSpan, message) {
    clearChildren(tbody);
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.className = 'table-empty';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function showGlobalAlert(message, type = 'info') {
    el.globalAlert.className = `alert-banner alert-${type}`;
    el.globalAlertText.textContent = message;
    setVisible(el.globalAlert, true);
}

function hideGlobalAlert() {
    setVisible(el.globalAlert, false);
    el.globalAlertText.textContent = '';
}

function showFormError(moduleKey, message) {
    const box = document.getElementById(`error-${moduleKey}`);
    if (!box) {
        return;
    }
    box.textContent = message;
    setVisible(box, true);
}

function clearFormError(moduleKey) {
    const box = document.getElementById(`error-${moduleKey}`);
    if (!box) {
        return;
    }
    box.textContent = '';
    setVisible(box, false);
}

function updateTelemetryBar(info) {
    el.telemetryMethod.textContent = info.method;
    el.telemetryEndpoint.textContent = info.endpoint;
    el.telemetryTime.textContent = info.timestamp;
    el.telemetryMessage.textContent = info.message;

    let badgeClass = 'badge badge-neutral';
    let badgeText = `HTTP ${info.status}`;
    if (info.status === 0) {
        badgeClass = 'badge badge-danger';
        badgeText = 'ERROR RED';
    } else if (info.status >= 200 && info.status < 300) {
        badgeClass = 'badge badge-success';
    } else if (info.status === 429) {
        badgeClass = 'badge badge-warn';
        badgeText = 'HTTP 429 THROTTLED';
    } else if (info.status >= 400 && info.status < 500) {
        badgeClass = 'badge badge-warn';
    } else if (info.status >= 500) {
        badgeClass = 'badge badge-danger';
    }

    el.telemetryStatus.className = badgeClass;
    el.telemetryStatus.textContent = badgeText;
}

/* Modal de confirmación sin dependencias nativas */
function openConfirmModal(title, message, onConfirm) {
    state.pendingConfirmAction = onConfirm;
    el.confirmModalTitle.textContent = title;
    el.confirmModalMessage.textContent = message;
    setVisible(el.confirmModal, true);
}

function closeConfirmModal() {
    state.pendingConfirmAction = null;
    setVisible(el.confirmModal, false);
}

/* Utilidades de formato para fechas y nombres relacionales */
function formatDateTimeDisplay(isoValue) {
    if (!isoValue) {
        return '—';
    }
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
        return isoValue;
    }
    return date.toLocaleString('es-CL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function toDatetimeLocalInput(isoValue) {
    if (!isoValue) {
        return '';
    }
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function findTutorLabel(tutorId) {
    const tutor = state.tutores.find((t) => t.id === tutorId);
    return tutor ? `${tutor.nombre} ${tutor.apellido}` : `Tutor #${tutorId}`;
}

function findMascotaLabel(mascotaId) {
    const mascota = state.mascotas.find((m) => m.id === mascotaId);
    return mascota ? `${mascota.nombre} (${mascota.especie})` : `Mascota #${mascotaId}`;
}

function findVeterinarioLabel(vetId) {
    const vet = state.veterinarios.find((v) => v.id === vetId);
    return vet ? `${vet.nombre} — ${vet.especialidad}` : `Veterinario #${vetId}`;
}

function findCitaLabel(citaId) {
    const cita = state.citas.find((c) => c.id === citaId);
    if (!cita) {
        return `Cita #${citaId}`;
    }
    return `#${cita.id} — ${findMascotaLabel(cita.mascota)} (${formatDateTimeDisplay(cita.fecha_hora)})`;
}

function populateSelect(selectEl, items, placeholder, labelFn) {
    const currentValue = selectEl.value;
    clearChildren(selectEl);

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = placeholder;
    selectEl.appendChild(defaultOpt);

    items.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = String(item.id);
        opt.textContent = labelFn(item);
        selectEl.appendChild(opt);
    });

    if (currentValue) {
        selectEl.value = currentValue;
    }
}

function refreshAllSelects() {
    populateSelect(
        document.getElementById('mascota-tutor'),
        state.tutores,
        'Seleccione un tutor...',
        (t) => `${t.nombre} ${t.apellido} (${t.email})`
    );
    populateSelect(
        document.getElementById('cita-mascota'),
        state.mascotas,
        'Seleccione una mascota...',
        (m) => `${m.nombre} (${m.especie}) — ${findTutorLabel(m.tutor)}`
    );
    populateSelect(
        document.getElementById('cita-veterinario'),
        state.veterinarios,
        'Seleccione un veterinario...',
        (v) => `${v.nombre} (${v.especialidad})`
    );
    populateSelect(
        document.getElementById('ficha-cita'),
        state.citas,
        'Seleccione una cita...',
        (c) => findCitaLabel(c.id)
    );
    populateSelect(
        document.getElementById('recordatorio-mascota'),
        state.mascotas,
        'Seleccione una mascota...',
        (m) => `${m.nombre} (${m.especie})`
    );
}

/* Control de navegación por pestañas */
function activateTab(tabName) {
    state.activeTab = tabName;
    el.tabButtons.forEach((btn) => {
        const isCurrent = btn.dataset.tab === tabName;
        btn.classList.toggle('is-active', isCurrent);
        btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });
    el.tabPanels.forEach((panel) => {
        const isCurrent = panel.id === `panel-${tabName}`;
        setVisible(panel, isCurrent);
    });
}

/* Control de sesión de usuario */
function showLoginView(reasonMessage = '') {
    state.user = null;
    closeConfirmModal();
    setVisible(el.loginSection, true);
    setVisible(el.appSection, false);
    setVisible(el.userStatusBox, false);
    el.loginPassword.value = '';
    if (reasonMessage) {
        showGlobalAlert(reasonMessage, 'warn');
    }
}

function showAppView(user) {
    state.user = user;
    el.userNameDisplay.textContent = user.full_name || user.username;
    el.userRoleBadge.textContent = user.is_staff ? 'Staff Clínico' : 'Usuario';
    el.userRoleBadge.className = user.is_staff ? 'badge badge-success' : 'badge badge-info';
    setVisible(el.userStatusBox, true);
    setVisible(el.loginSection, false);
    setVisible(el.appSection, true);
}

async function loadAllModules() {
    try {
        const [tutoresRes, mascotasRes, vetsRes, citasRes, fichasRes, recRes] = await Promise.all([
            apiRequest('/api/tutores/'),
            apiRequest('/api/mascotas/'),
            apiRequest('/api/veterinarios/'),
            apiRequest('/api/citas/'),
            apiRequest('/api/fichas/'),
            apiRequest('/api/recordatorios/'),
        ]);

        state.tutores = Array.isArray(tutoresRes.data) ? tutoresRes.data : [];
        state.mascotas = Array.isArray(mascotasRes.data) ? mascotasRes.data : [];
        state.veterinarios = Array.isArray(vetsRes.data) ? vetsRes.data : [];
        state.citas = Array.isArray(citasRes.data) ? citasRes.data : [];
        state.fichas = Array.isArray(fichasRes.data) ? fichasRes.data : [];
        state.recordatorios = Array.isArray(recRes.data) ? recRes.data : [];

        refreshAllSelects();
        renderTutores();
        renderMascotas();
        renderVeterinarios();
        renderCitas();
        renderFichas();
        renderRecordatorios();
    } catch (error) {
        if (error.status !== 401) {
            showGlobalAlert(`No fue posible sincronizar los datos clínicos: ${error.message}`, 'error');
        }
    }
}

/* Helpers genéricos de modo edición */
function setEditMode(moduleKey, isEditing, createTitle, editTitle, createBtn, editBtn) {
    document.getElementById(`formTitle-${moduleKey}`).textContent = isEditing ? editTitle : createTitle;
    document.getElementById(`btnSubmit-${moduleKey}`).textContent = isEditing ? editBtn : createBtn;
    setVisible(document.getElementById(`btnCancel-${moduleKey}`), isEditing);
}

/* ======================== MÓDULO 1: TUTORES ======================== */
function resetTutorForm() {
    document.getElementById('form-tutores').reset();
    document.getElementById('tutor-id').value = '';
    clearFormError('tutores');
    setEditMode('tutores', false, 'Nuevo Tutor', 'Editar Tutor', 'Guardar Tutor', 'Actualizar Tutor');
}

function renderTutores() {
    const tbody = document.getElementById('tbody-tutores');
    document.getElementById('count-tutores').textContent = String(state.tutores.length);
    if (state.tutores.length === 0) {
        renderEmptyRow(tbody, 6, 'No hay tutores registrados.');
        return;
    }

    clearChildren(tbody);
    state.tutores.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(`${item.nombre} ${item.apellido}`));
        tr.appendChild(createTextCell(item.telefono));
        tr.appendChild(createTextCell(item.email));
        tr.appendChild(createTextCell(item.direccion));

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('tutor-id').value = String(item.id);
            document.getElementById('tutor-nombre').value = item.nombre || '';
            document.getElementById('tutor-apellido').value = item.apellido || '';
            document.getElementById('tutor-telefono').value = item.telefono || '';
            document.getElementById('tutor-email').value = item.email || '';
            document.getElementById('tutor-direccion').value = item.direccion || '';
            clearFormError('tutores');
            setEditMode('tutores', true, 'Nuevo Tutor', `Editar Tutor #${item.id}`, 'Guardar Tutor', 'Actualizar Tutor');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar tutor',
                `¿Desea eliminar al tutor ${item.nombre} ${item.apellido}? Esta acción eliminará sus mascotas asociadas.`,
                async () => {
                    await apiRequest(`/api/tutores/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Tutor #${item.id} eliminado correctamente.`, 'success');
                    resetTutorForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleTutorSubmit(event) {
    event.preventDefault();
    clearFormError('tutores');

    const id = document.getElementById('tutor-id').value;
    const payload = {
        nombre: document.getElementById('tutor-nombre').value,
        apellido: document.getElementById('tutor-apellido').value,
        telefono: document.getElementById('tutor-telefono').value,
        email: document.getElementById('tutor-email').value,
        direccion: document.getElementById('tutor-direccion').value,
    };

    try {
        if (id) {
            await apiRequest(`/api/tutores/${id}/`, { method: 'PATCH', body: payload });
            showGlobalAlert(`Tutor #${id} actualizado correctamente.`, 'success');
        } else {
            await apiRequest('/api/tutores/', { method: 'POST', body: payload });
            showGlobalAlert('Tutor registrado exitosamente.', 'success');
        }
        resetTutorForm();
        await loadAllModules();
    } catch (error) {
        showFormError('tutores', formatApiError(error.data, error.message));
    }
}

/* ======================== MÓDULO 2: MASCOTAS ======================== */
function resetMascotaForm() {
    document.getElementById('form-mascotas').reset();
    document.getElementById('mascota-id').value = '';
    clearFormError('mascotas');
    setEditMode('mascotas', false, 'Nueva Mascota', 'Editar Mascota', 'Guardar Mascota', 'Actualizar Mascota');
}

function renderMascotas() {
    const tbody = document.getElementById('tbody-mascotas');
    document.getElementById('count-mascotas').textContent = String(state.mascotas.length);
    if (state.mascotas.length === 0) {
        renderEmptyRow(tbody, 6, 'No hay mascotas registradas.');
        return;
    }

    clearChildren(tbody);
    state.mascotas.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(item.nombre));
        tr.appendChild(createTextCell(item.raza ? `${item.especie} / ${item.raza}` : item.especie));
        tr.appendChild(createTextCell(findTutorLabel(item.tutor)));
        tr.appendChild(createTextCell(item.fecha_nacimiento));

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('mascota-id').value = String(item.id);
            document.getElementById('mascota-tutor').value = String(item.tutor);
            document.getElementById('mascota-nombre').value = item.nombre || '';
            document.getElementById('mascota-especie').value = item.especie || 'Canino';
            document.getElementById('mascota-raza').value = item.raza || '';
            document.getElementById('mascota-fecha-nacimiento').value = item.fecha_nacimiento || '';
            clearFormError('mascotas');
            setEditMode('mascotas', true, 'Nueva Mascota', `Editar Mascota #${item.id}`, 'Guardar Mascota', 'Actualizar Mascota');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar mascota',
                `¿Desea eliminar a la mascota ${item.nombre}?`,
                async () => {
                    await apiRequest(`/api/mascotas/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Mascota #${item.id} eliminada correctamente.`, 'success');
                    resetMascotaForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleMascotaSubmit(event) {
    event.preventDefault();
    clearFormError('mascotas');

    const id = document.getElementById('mascota-id').value;
    const fechaNac = document.getElementById('mascota-fecha-nacimiento').value;
    const payload = {
        tutor: Number(document.getElementById('mascota-tutor').value),
        nombre: document.getElementById('mascota-nombre').value,
        especie: document.getElementById('mascota-especie').value,
        raza: document.getElementById('mascota-raza').value || null,
        fecha_nacimiento: fechaNac || null,
    };

    try {
        if (id) {
            await apiRequest(`/api/mascotas/${id}/`, { method: 'PATCH', body: payload });
            showGlobalAlert(`Mascota #${id} actualizada correctamente.`, 'success');
        } else {
            await apiRequest('/api/mascotas/', { method: 'POST', body: payload });
            showGlobalAlert('Mascota registrada exitosamente.', 'success');
        }
        resetMascotaForm();
        await loadAllModules();
    } catch (error) {
        showFormError('mascotas', formatApiError(error.data, error.message));
    }
}

/* ======================== MÓDULO 3: VETERINARIOS ======================== */
function resetVeterinarioForm() {
    document.getElementById('form-veterinarios').reset();
    document.getElementById('veterinario-id').value = '';
    clearFormError('veterinarios');
    setEditMode('veterinarios', false, 'Nuevo Veterinario', 'Editar Veterinario', 'Guardar Veterinario', 'Actualizar Veterinario');
}

function renderVeterinarios() {
    const tbody = document.getElementById('tbody-veterinarios');
    document.getElementById('count-veterinarios').textContent = String(state.veterinarios.length);
    if (state.veterinarios.length === 0) {
        renderEmptyRow(tbody, 6, 'No hay veterinarios registrados.');
        return;
    }

    clearChildren(tbody);
    state.veterinarios.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(item.nombre));
        tr.appendChild(createTextCell(item.usuario));
        tr.appendChild(createTextCell(item.especialidad));
        tr.appendChild(createTextCell(item.telefono));

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('veterinario-id').value = String(item.id);
            document.getElementById('veterinario-usuario').value = String(item.usuario);
            document.getElementById('veterinario-especialidad').value = item.especialidad || '';
            document.getElementById('veterinario-telefono').value = item.telefono || '';
            clearFormError('veterinarios');
            setEditMode('veterinarios', true, 'Nuevo Veterinario', `Editar Veterinario #${item.id}`, 'Guardar Veterinario', 'Actualizar Veterinario');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar veterinario',
                `¿Desea eliminar el perfil veterinario de ${item.nombre}?`,
                async () => {
                    await apiRequest(`/api/veterinarios/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Veterinario #${item.id} eliminado correctamente.`, 'success');
                    resetVeterinarioForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleVeterinarioSubmit(event) {
    event.preventDefault();
    clearFormError('veterinarios');

    const id = document.getElementById('veterinario-id').value;
    const payload = {
        usuario: Number(document.getElementById('veterinario-usuario').value),
        especialidad: document.getElementById('veterinario-especialidad').value,
        telefono: document.getElementById('veterinario-telefono').value,
    };

    try {
        if (id) {
            await apiRequest(`/api/veterinarios/${id}/`, { method: 'PATCH', body: payload });
            showGlobalAlert(`Veterinario #${id} actualizado correctamente.`, 'success');
        } else {
            await apiRequest('/api/veterinarios/', { method: 'POST', body: payload });
            showGlobalAlert('Veterinario registrado exitosamente.', 'success');
        }
        resetVeterinarioForm();
        await loadAllModules();
    } catch (error) {
        showFormError('veterinarios', formatApiError(error.data, error.message));
    }
}

/* ======================== MÓDULO 4: CITAS ======================== */
function resetCitaForm() {
    document.getElementById('form-citas').reset();
    document.getElementById('cita-id').value = '';
    clearFormError('citas');
    setEditMode('citas', false, 'Agendar Cita', 'Editar Cita', 'Guardar Cita', 'Actualizar Cita');
}

function renderCitas() {
    const tbody = document.getElementById('tbody-citas');
    document.getElementById('count-citas').textContent = String(state.citas.length);
    if (state.citas.length === 0) {
        renderEmptyRow(tbody, 7, 'No hay citas registradas.');
        return;
    }

    clearChildren(tbody);
    state.citas.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(formatDateTimeDisplay(item.fecha_hora)));
        tr.appendChild(createTextCell(findMascotaLabel(item.mascota)));
        tr.appendChild(createTextCell(findVeterinarioLabel(item.veterinario)));
        tr.appendChild(createTextCell(item.motivo));

        const statusTd = document.createElement('td');
        let variant = 'warn';
        if (item.estado === 'Realizada') {
            variant = 'success';
        } else if (item.estado === 'Cancelada') {
            variant = 'danger';
        }
        statusTd.appendChild(createBadge(item.estado, variant));
        tr.appendChild(statusTd);

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('cita-id').value = String(item.id);
            document.getElementById('cita-mascota').value = String(item.mascota);
            document.getElementById('cita-veterinario').value = String(item.veterinario);
            document.getElementById('cita-fecha-hora').value = toDatetimeLocalInput(item.fecha_hora);
            document.getElementById('cita-estado').value = item.estado || 'Pendiente';
            document.getElementById('cita-motivo').value = item.motivo || '';
            clearFormError('citas');
            setEditMode('citas', true, 'Agendar Cita', `Editar Cita #${item.id}`, 'Guardar Cita', 'Actualizar Cita');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar cita',
                `¿Desea eliminar la cita #${item.id}?`,
                async () => {
                    await apiRequest(`/api/citas/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Cita #${item.id} eliminada correctamente.`, 'success');
                    resetCitaForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleCitaSubmit(event) {
    event.preventDefault();
    clearFormError('citas');

    const id = document.getElementById('cita-id').value;
    const rawDateTime = document.getElementById('cita-fecha-hora').value;
    const parsedDate = rawDateTime ? new Date(rawDateTime) : null;
    const isoDateTime = parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : rawDateTime;

    const payload = {
        mascota: Number(document.getElementById('cita-mascota').value),
        veterinario: Number(document.getElementById('cita-veterinario').value),
        fecha_hora: isoDateTime,
        estado: document.getElementById('cita-estado').value,
        motivo: document.getElementById('cita-motivo').value,
    };

    try {
        if (id) {
            await apiRequest(`/api/citas/${id}/`, { method: 'PATCH', body: payload });
            showGlobalAlert(`Cita #${id} actualizada correctamente.`, 'success');
        } else {
            await apiRequest('/api/citas/', { method: 'POST', body: payload });
            showGlobalAlert('Cita agendada exitosamente.', 'success');
        }
        resetCitaForm();
        await loadAllModules();
    } catch (error) {
        const readable = formatApiError(error.data, error.message);
        showFormError('citas', readable);
        if (error.status === 400) {
            showGlobalAlert(`Validación de cita rechazada (HTTP 400): ${readable}`, 'warn');
        }
    }
}

/* ======================== MÓDULO 5: FICHAS CLÍNICAS ======================== */
function resetFichaForm() {
    document.getElementById('form-fichas').reset();
    document.getElementById('ficha-id').value = '';
    clearFormError('fichas');
    setEditMode('fichas', false, 'Nueva Ficha Clínica', 'Editar Ficha Clínica', 'Guardar Ficha', 'Actualizar Ficha');
}

function renderFichas() {
    const tbody = document.getElementById('tbody-fichas');
    document.getElementById('count-fichas').textContent = String(state.fichas.length);
    if (state.fichas.length === 0) {
        renderEmptyRow(tbody, 6, 'No hay fichas clínicas registradas.');
        return;
    }

    clearChildren(tbody);
    state.fichas.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(findCitaLabel(item.cita)));
        tr.appendChild(createTextCell(item.diagnostico));
        tr.appendChild(createTextCell(item.tratamiento));

        const docTd = document.createElement('td');
        const safeUrl = resolveSafeMediaUrl(item.documento_adjunto);
        if (safeUrl) {
            const link = document.createElement('a');
            link.href = safeUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'doc-link';
            link.textContent = 'Abrir adjunto';
            docTd.appendChild(link);
        } else {
            docTd.textContent = 'Sin adjunto';
        }
        tr.appendChild(docTd);

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('ficha-id').value = String(item.id);
            document.getElementById('ficha-cita').value = String(item.cita);
            document.getElementById('ficha-diagnostico').value = item.diagnostico || '';
            document.getElementById('ficha-tratamiento').value = item.tratamiento || '';
            document.getElementById('ficha-receta').value = item.receta || '';
            document.getElementById('ficha-examenes').value = item.examenes || '';
            document.getElementById('ficha-documento').value = '';
            clearFormError('fichas');
            setEditMode('fichas', true, 'Nueva Ficha Clínica', `Editar Ficha #${item.id}`, 'Guardar Ficha', 'Actualizar Ficha');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar ficha clínica',
                `¿Desea eliminar la ficha clínica #${item.id}?`,
                async () => {
                    await apiRequest(`/api/fichas/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Ficha clínica #${item.id} eliminada correctamente.`, 'success');
                    resetFichaForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleFichaSubmit(event) {
    event.preventDefault();
    clearFormError('fichas');

    const id = document.getElementById('ficha-id').value;
    const formData = new FormData();
    formData.append('cita', document.getElementById('ficha-cita').value);
    formData.append('diagnostico', document.getElementById('ficha-diagnostico').value);
    formData.append('tratamiento', document.getElementById('ficha-tratamiento').value);
    formData.append('receta', document.getElementById('ficha-receta').value);
    formData.append('examenes', document.getElementById('ficha-examenes').value);

    const fileInput = document.getElementById('ficha-documento');
    if (fileInput.files && fileInput.files.length > 0) {
        formData.append('documento_adjunto', fileInput.files[0]);
    }

    try {
        if (id) {
            await apiRequest(`/api/fichas/${id}/`, { method: 'PATCH', body: formData });
            showGlobalAlert(`Ficha clínica #${id} actualizada correctamente.`, 'success');
        } else {
            await apiRequest('/api/fichas/', { method: 'POST', body: formData });
            showGlobalAlert('Ficha clínica registrada exitosamente.', 'success');
        }
        resetFichaForm();
        await loadAllModules();
    } catch (error) {
        showFormError('fichas', formatApiError(error.data, error.message));
    }
}

/* ======================== MÓDULO 6: RECORDATORIOS ======================== */
function resetRecordatorioForm() {
    document.getElementById('form-recordatorios').reset();
    document.getElementById('recordatorio-id').value = '';
    clearFormError('recordatorios');
    setEditMode('recordatorios', false, 'Nuevo Recordatorio', 'Editar Recordatorio', 'Guardar Recordatorio', 'Actualizar Recordatorio');
}

function renderRecordatorios() {
    const tbody = document.getElementById('tbody-recordatorios');
    document.getElementById('count-recordatorios').textContent = String(state.recordatorios.length);
    if (state.recordatorios.length === 0) {
        renderEmptyRow(tbody, 7, 'No hay recordatorios registrados.');
        return;
    }

    clearChildren(tbody);
    state.recordatorios.forEach((item) => {
        const tr = document.createElement('tr');
        tr.appendChild(createTextCell(item.id));
        tr.appendChild(createTextCell(findMascotaLabel(item.mascota)));
        tr.appendChild(createTextCell(item.tipo));
        tr.appendChild(createTextCell(item.descripcion));
        tr.appendChild(createTextCell(item.fecha_programada));

        const statusTd = document.createElement('td');
        statusTd.appendChild(
            createBadge(
                item.completado ? 'Completado' : 'Pendiente',
                item.completado ? 'success' : 'warn'
            )
        );
        tr.appendChild(statusTd);

        const actionsTd = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        wrap.appendChild(createActionButton(
            item.completado ? 'Reabrir' : 'Completar',
            'primary',
            async () => {
                try {
                    await apiRequest(`/api/recordatorios/${item.id}/`, {
                        method: 'PATCH',
                        body: { completado: !item.completado },
                    });
                    showGlobalAlert(`Estado del recordatorio #${item.id} actualizado.`, 'success');
                    await loadAllModules();
                } catch (error) {
                    showGlobalAlert(`No se pudo actualizar el recordatorio: ${error.message}`, 'error');
                }
            }
        ));
        wrap.appendChild(createActionButton('Editar', 'secondary', () => {
            document.getElementById('recordatorio-id').value = String(item.id);
            document.getElementById('recordatorio-mascota').value = String(item.mascota);
            document.getElementById('recordatorio-tipo').value = item.tipo || 'Vacuna';
            document.getElementById('recordatorio-descripcion').value = item.descripcion || '';
            document.getElementById('recordatorio-fecha').value = item.fecha_programada || '';
            document.getElementById('recordatorio-completado').checked = Boolean(item.completado);
            clearFormError('recordatorios');
            setEditMode('recordatorios', true, 'Nuevo Recordatorio', `Editar Recordatorio #${item.id}`, 'Guardar Recordatorio', 'Actualizar Recordatorio');
        }));
        wrap.appendChild(createActionButton('Eliminar', 'danger', () => {
            openConfirmModal(
                'Eliminar recordatorio',
                `¿Desea eliminar el recordatorio #${item.id}?`,
                async () => {
                    await apiRequest(`/api/recordatorios/${item.id}/`, { method: 'DELETE' });
                    showGlobalAlert(`Recordatorio #${item.id} eliminado correctamente.`, 'success');
                    resetRecordatorioForm();
                    await loadAllModules();
                }
            );
        }));
        actionsTd.appendChild(wrap);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });
}

async function handleRecordatorioSubmit(event) {
    event.preventDefault();
    clearFormError('recordatorios');

    const id = document.getElementById('recordatorio-id').value;
    const payload = {
        mascota: Number(document.getElementById('recordatorio-mascota').value),
        tipo: document.getElementById('recordatorio-tipo').value,
        descripcion: document.getElementById('recordatorio-descripcion').value,
        fecha_programada: document.getElementById('recordatorio-fecha').value,
        completado: document.getElementById('recordatorio-completado').checked,
    };

    try {
        if (id) {
            await apiRequest(`/api/recordatorios/${id}/`, { method: 'PATCH', body: payload });
            showGlobalAlert(`Recordatorio #${id} actualizado correctamente.`, 'success');
        } else {
            await apiRequest('/api/recordatorios/', { method: 'POST', body: payload });
            showGlobalAlert('Recordatorio registrado exitosamente.', 'success');
        }
        resetRecordatorioForm();
        await loadAllModules();
    } catch (error) {
        showFormError('recordatorios', formatApiError(error.data, error.message));
    }
}

/* ======================== EVENTOS GLOBALES E INICIALIZACIÓN ======================== */
async function handleLoginSubmit(event) {
    event.preventDefault();
    setVisible(el.loginError, false);
    el.loginError.textContent = '';

    const username = el.loginUsername.value.trim();
    const password = el.loginPassword.value;

    if (!username || !password) {
        el.loginError.textContent = 'Debe ingresar usuario y contraseña.';
        setVisible(el.loginError, true);
        return;
    }

    try {
        await login(username, password);
        const user = await fetchCurrentUser();
        showAppView(user);
        showGlobalAlert(`Sesión iniciada correctamente como ${user.full_name || user.username}.`, 'success');
        await loadAllModules();
    } catch (error) {
        el.loginError.textContent = formatApiError(error.data, 'Credenciales inválidas o error de conexión.');
        setVisible(el.loginError, true);
    }
}

async function handleHealthCheck() {
    try {
        const result = await checkApiHealth();
        showGlobalAlert(
            `Salud API OK (HTTP ${result.status}): ${JSON.stringify(result.data)}`,
            'info'
        );
    } catch (error) {
        const level = error.status === 429 ? 'warn' : 'error';
        showGlobalAlert(
            `Verificación de salud fallida (HTTP ${error.status || 'RED'}): ${error.message}`,
            level
        );
    }
}

function bindEvents() {
    el.btnCloseAlert.addEventListener('click', hideGlobalAlert);
    el.btnHealthCheck.addEventListener('click', handleHealthCheck);

    el.loginForm.addEventListener('submit', handleLoginSubmit);
    el.btnLogout.addEventListener('click', () => {
        clearTokens();
        showLoginView('Sesión cerrada de forma segura.');
    });

    el.btnRefreshAll.addEventListener('click', async () => {
        await loadAllModules();
        showGlobalAlert('Datos clínicos sincronizados desde la API.', 'info');
    });

    el.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

    document.getElementById('form-tutores').addEventListener('submit', handleTutorSubmit);
    document.getElementById('btnCancel-tutores').addEventListener('click', resetTutorForm);

    document.getElementById('form-mascotas').addEventListener('submit', handleMascotaSubmit);
    document.getElementById('btnCancel-mascotas').addEventListener('click', resetMascotaForm);

    document.getElementById('form-veterinarios').addEventListener('submit', handleVeterinarioSubmit);
    document.getElementById('btnCancel-veterinarios').addEventListener('click', resetVeterinarioForm);

    document.getElementById('form-citas').addEventListener('submit', handleCitaSubmit);
    document.getElementById('btnCancel-citas').addEventListener('click', resetCitaForm);

    document.getElementById('form-fichas').addEventListener('submit', handleFichaSubmit);
    document.getElementById('btnCancel-fichas').addEventListener('click', resetFichaForm);

    document.getElementById('form-recordatorios').addEventListener('submit', handleRecordatorioSubmit);
    document.getElementById('btnCancel-recordatorios').addEventListener('click', resetRecordatorioForm);

    el.btnConfirmCancel.addEventListener('click', closeConfirmModal);
    el.confirmModal.addEventListener('click', (event) => {
        if (event.target === el.confirmModal) {
            closeConfirmModal();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !el.confirmModal.hidden) {
            closeConfirmModal();
        }
    });
    el.btnConfirmAccept.addEventListener('click', async () => {
        const action = state.pendingConfirmAction;
        closeConfirmModal();
        if (!action) {
            return;
        }
        try {
            await action();
        } catch (error) {
            showGlobalAlert(`Error al ejecutar la eliminación: ${error.message}`, 'error');
        }
    });
}

async function init() {
    closeConfirmModal();
    el.apiBaseBadge.textContent = APP_CONFIG.API_BASE_URL;

    const safeBrandLogo = resolveSafeMediaUrl(APP_CONFIG.S3_BRAND_ASSET_URL);
    if (safeBrandLogo) {
        el.brandLogo.src = safeBrandLogo;
        setVisible(el.brandLogo, true);
    }

    setTelemetryListener(updateTelemetryBar);
    setUnauthorizedListener((message) => showLoginView(message));
    bindEvents();

    if (hasSession()) {
        try {
            const user = await fetchCurrentUser();
            showAppView(user);
            await loadAllModules();
            return;
        } catch (_error) {
            clearTokens();
        }
    }

    showLoginView();
}

function startApp() {
    init().catch((error) => {
        showGlobalAlert(
            `Error al inicializar la aplicación: ${error.message || 'Falla inesperada.'}`,
            'error'
        );
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
