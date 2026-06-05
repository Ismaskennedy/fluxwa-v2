// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = '';  // Same origin
let token = localStorage.getItem('token');
let currentUser = null;
let socket = null;
let currentConvId = null;
let dashChart = null;

// ─── UTILS ────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + '/api' + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...opts.headers },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en el servidor');
  return data;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
  el.innerHTML = `<i class="fas fa-${icons[type]}" style="color:var(--${type==='success'?'green':type==='error'?'red':'blue'})"></i> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.remove('open');
}

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtRelative(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d);
  if (diff < 60000) return 'hace un momento';
  if (diff < 3600000) return `hace ${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return `hace ${Math.floor(diff/3600000)}h`;
  return new Date(d).toLocaleDateString('es-MX');
}

function statusBadge(s) {
  const map = {
    running: ['green','Ejecutando'], completed: ['green','Completada'], paused: ['yellow','Pausada'],
    draft: ['gray','Borrador'], failed: ['red','Fallida'],
    sent: ['blue','Enviado'], delivered: ['green','Entregado'], read: ['green','Leído'],
    failed: ['red','Fallido'], pending: ['yellow','Pendiente'],
    connected: ['green','Conectada'], disconnected: ['gray','Desconectada'],
    connecting: ['yellow','Conectando...'], banned: ['red','Bloqueada'],
    open: ['blue','Abierta'], assigned: ['green','Asignada'], closed: ['gray','Cerrada']
  };
  const [color, label] = map[s] || ['gray', s];
  return `<span class="badge badge-${color}">${label}</span>`;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    startApp();
  } catch (e) { toast(e.message, 'error'); }
}

function showRegister() {
  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">Crear cuenta</div>
    <div class="form-group"><label class="label">Nombre</label><input class="input" id="reg-name" placeholder="Tu nombre"></div>
    <div class="form-group"><label class="label">Correo</label><input class="input" id="reg-email" type="email" placeholder="correo@empresa.com"></div>
    <div class="form-group"><label class="label">Contraseña</label><input class="input" id="reg-pass" type="password"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="register()">Crear cuenta</button>
  `);
}

async function register() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-pass').value;
  try {
    await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    toast('Cuenta creada, inicia sesión', 'success');
    closeModal();
  } catch (e) { toast(e.message, 'error'); }
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  if (socket) socket.disconnect();
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

async function startApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  if (!currentUser) {
    try { currentUser = await api('/auth/me'); } catch { return logout(); }
  }

  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = currentUser.role === 'admin' ? '👑 Admin' : '🎧 Agente';
  document.getElementById('user-avatar').textContent = currentUser.name[0].toUpperCase();

  initSocket();
  navigate('dashboard');
}

// ─── SOCKET ───────────────────────────────────────────────────────────────────
function initSocket() {
  socket = io();
  socket.on('qr_code', ({ lineId, qrCode }) => {
    const img = document.getElementById(`qr-${lineId}`);
    if (img) { img.src = qrCode; img.style.display = 'block'; }
  });
  socket.on('line_status', ({ lineId, status }) => {
    const el = document.getElementById(`line-status-${lineId}`);
    if (el) el.innerHTML = statusBadge(status);
    if (status === 'connected') toast('Línea conectada ✓', 'success');
  });
  socket.on('campaign_progress', ({ campaignId, sent, failed, total, percent }) => {
    const bar = document.getElementById(`progress-${campaignId}`);
    const txt = document.getElementById(`progress-txt-${campaignId}`);
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.textContent = `${sent + failed}/${total} (${percent}%)`;
  });
  socket.on('campaign_completed', () => { toast('¡Campaña completada!', 'success'); });
  socket.on('new_message', ({ conversation }) => {
    updateInboxBadge();
    if (currentConvId === conversation) loadChatMessages(conversation);
    else refreshConvList();
  });
  socket.on('conversation_assigned', () => refreshConvList());
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => { if (n.getAttribute('onclick')?.includes(page)) n.classList.add('active'); });

  const renderers = {
    dashboard: renderDashboard, campaigns: renderCampaigns,
    contacts: renderContacts, templates: renderTemplates,
    lines: renderLines, inbox: renderInbox, reports: renderReports
  };
  if (renderers[page]) renderers[page]();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div style="color:var(--muted);padding:40px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>`;
  const data = await api('/dashboard');
  const s = data.summary;

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Dashboard <small>Resumen general de la plataforma</small></div>
      <button class="btn btn-ghost btn-sm" onclick="renderDashboard()"><i class="fas fa-sync-alt"></i> Actualizar</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-icon">📨</div>
        <div class="stat-value">${s.totalMessages.toLocaleString()}</div>
        <div class="stat-label">Total enviados</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">📋</div>
        <div class="stat-value">${s.totalCampaigns}</div>
        <div class="stat-label">Campañas — <b style="color:var(--green)">${s.activeCampaigns} activas</b></div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${s.totalContacts.toLocaleString()}</div>
        <div class="stat-label">Contactos</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">💬</div>
        <div class="stat-value">${s.openConversations}</div>
        <div class="stat-label">Conversaciones abiertas</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon">📱</div>
        <div class="stat-value">${s.connectedLines}</div>
        <div class="stat-label">Líneas conectadas</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon">✅</div>
        <div class="stat-value">${s.readMessages.toLocaleString()}</div>
        <div class="stat-label">Mensajes leídos</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <h3 style="font-size:15px;margin-bottom:16px">Mensajes por día (últimos 7 días)</h3>
        <canvas id="daily-chart" height="100"></canvas>
      </div>
      <div class="card">
        <h3 style="font-size:15px;margin-bottom:16px">Estado de mensajes</h3>
        <canvas id="status-chart" height="100"></canvas>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3 style="font-size:15px;margin-bottom:16px">Campañas recientes</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Campaña</th><th>Estado</th><th>Enviados</th><th>Fallidos</th><th>Total</th><th>Fecha</th></tr></thead>
          <tbody>
            ${data.recentCampaigns.map(c => `
              <tr>
                <td><b>${c.name}</b></td>
                <td>${statusBadge(c.status)}</td>
                <td style="color:var(--green)">${c.sent}</td>
                <td style="color:var(--red)">${c.failed}</td>
                <td>${c.totalContacts}</td>
                <td style="color:var(--muted)">${fmtDate(c.createdAt)}</td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin campañas</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  // Charts
  const labels = data.dailyStats.map(d => d._id);
  const sentData = data.dailyStats.map(d => d.sent);
  const failedData = data.dailyStats.map(d => d.failed);

  new Chart(document.getElementById('daily-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Enviados', data: sentData, backgroundColor: '#00e67688', borderColor: '#00e676', borderWidth: 2, borderRadius: 4 },
        { label: 'Fallidos', data: failedData, backgroundColor: '#ff475744', borderColor: '#ff4757', borderWidth: 2, borderRadius: 4 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e8eaf0' } } }, scales: { x: { ticks: { color: '#5a6070' }, grid: { color: '#1e2229' } }, y: { ticks: { color: '#5a6070' }, grid: { color: '#1e2229' } } } }
  });

  new Chart(document.getElementById('status-chart'), {
    type: 'doughnut',
    data: {
      labels: ['Enviados', 'Entregados', 'Leídos', 'Fallidos'],
      datasets: [{ data: [s.sentMessages, s.deliveredMessages, s.readMessages, s.failedMessages], backgroundColor: ['#3d9cf5','#00e676','#00e676cc','#ff4757'], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#e8eaf0', padding: 12 } } }, cutout: '65%' }
  });
}

// ─── LINES ────────────────────────────────────────────────────────────────────
async function renderLines() {
  const el = document.getElementById('page-lines');
  const lines = await api('/lines');
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Líneas WhatsApp <small>Gestiona las conexiones de WhatsApp</small></div>
      <button class="btn btn-primary" onclick="newLine()"><i class="fas fa-plus"></i> Nueva línea</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      ${lines.map(l => `
        <div class="card" style="position:relative">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-weight:700;font-size:16px">${l.name}</div>
              <div style="color:var(--muted);font-size:12px;margin-top:4px">${l.phone || 'Sin número asignado'}</div>
            </div>
            <div id="line-status-${l._id}">${statusBadge(l.status)}</div>
          </div>
          ${l.qrCode ? `<div class="qr-container"><img id="qr-${l._id}" src="${l.qrCode}" style="width:180px;height:180px"><p style="color:var(--muted);font-size:12px;margin-top:8px">Escanea con WhatsApp</p></div>` : `<div id="qr-${l._id}" style="display:none"></div>`}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            ${l.status !== 'connected' ? `<button class="btn btn-primary btn-sm" onclick="connectLine('${l._id}')"><i class="fas fa-plug"></i> Conectar</button>` : `<button class="btn btn-ghost btn-sm" onclick="disconnectLine('${l._id}')"><i class="fas fa-unlink"></i> Desconectar</button>`}
            <button class="btn btn-danger btn-sm" onclick="deleteLine('${l._id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join('') || '<p style="color:var(--muted)">No hay líneas configuradas</p>'}
    </div>`;
}

function newLine() {
  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">Nueva Línea WhatsApp</div>
    <div class="form-group"><label class="label">Nombre de la línea</label><input class="input" id="line-name" placeholder="Ej: Línea Ventas 1"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="createLine()"><i class="fas fa-plus"></i> Crear línea</button>
  `);
}

async function createLine() {
  const name = document.getElementById('line-name').value;
  if (!name) return toast('Escribe un nombre', 'error');
  await api('/lines', { method: 'POST', body: JSON.stringify({ name }) });
  toast('Línea creada', 'success'); closeModal(); renderLines();
}

async function connectLine(id) {
  await api(`/lines/${id}/connect`, { method: 'POST' });
  toast('Iniciando conexión... espera el QR', 'info');
  renderLines();
}

async function disconnectLine(id) {
  if (!confirm('¿Desconectar esta línea?')) return;
  await api(`/lines/${id}/disconnect`, { method: 'POST' });
  toast('Línea desconectada', 'info'); renderLines();
}

async function deleteLine(id) {
  if (!confirm('¿Eliminar esta línea?')) return;
  await api(`/lines/${id}`, { method: 'DELETE' });
  toast('Línea eliminada', 'success'); renderLines();
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
async function renderTemplates() {
  const el = document.getElementById('page-templates');
  const templates = await api('/templates');
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Plantillas <small>Mensajes reutilizables con variables dinámicas</small></div>
      <button class="btn btn-primary" onclick="newTemplate()"><i class="fas fa-plus"></i> Nueva plantilla</button>
    </div>
    <div style="color:var(--muted);font-size:12px;margin-bottom:16px">
      💡 Usa variables: <code style="background:var(--surface2);padding:2px 6px;border-radius:4px">{{nombre}}</code>
      <code style="background:var(--surface2);padding:2px 6px;border-radius:4px">{{empresa}}</code>
      <code style="background:var(--surface2);padding:2px 6px;border-radius:4px">{{email}}</code> etc.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
      ${templates.map(t => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-weight:700">${t.name}</div>
            <span class="badge badge-blue">${t.type}</span>
          </div>
          <div style="background:var(--surface2);border-radius:8px;padding:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--text);margin-bottom:12px;max-height:100px;overflow-y:auto">${t.content}</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="editTemplate('${t._id}')"><i class="fas fa-edit"></i> Editar</button>
            <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${t._id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join('') || '<p style="color:var(--muted)">No hay plantillas</p>'}
    </div>`;
}

function newTemplate(data = {}) {
  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">${data._id ? 'Editar' : 'Nueva'} Plantilla</div>
    <div class="form-group"><label class="label">Nombre</label><input class="input" id="tpl-name" value="${data.name||''}" placeholder="Ej: Bienvenida clientes"></div>
    <div class="form-group">
      <label class="label">Tipo</label>
      <select class="select" id="tpl-type">
        <option value="text" ${data.type==='text'?'selected':''}>Texto</option>
        <option value="image" ${data.type==='image'?'selected':''}>Imagen</option>
        <option value="document" ${data.type==='document'?'selected':''}>Documento</option>
      </select>
    </div>
    <div class="form-group"><label class="label">Contenido del mensaje</label><textarea class="textarea" id="tpl-content" rows="6" placeholder="Hola {{nombre}}, te contactamos de {{empresa}}...">${data.content||''}</textarea></div>
    <div style="background:var(--surface2);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--muted)">
      <b style="color:var(--text)">Variables disponibles:</b> {{nombre}} {{empresa}} {{email}} {{telefono}} + cualquier columna de tu CSV
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="saveTemplate('${data._id||''}')">
      <i class="fas fa-save"></i> Guardar plantilla
    </button>
  `);
}

async function editTemplate(id) {
  const templates = await api('/templates');
  const t = templates.find(x => x._id === id);
  if (t) newTemplate(t);
}

async function saveTemplate(id) {
  const body = { name: document.getElementById('tpl-name').value, type: document.getElementById('tpl-type').value, content: document.getElementById('tpl-content').value };
  if (!body.name || !body.content) return toast('Completa todos los campos', 'error');
  if (id) await api(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  else await api('/templates', { method: 'POST', body: JSON.stringify(body) });
  toast('Plantilla guardada', 'success'); closeModal(); renderTemplates();
}

async function deleteTemplate(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  await api(`/templates/${id}`, { method: 'DELETE' });
  toast('Plantilla eliminada', 'success'); renderTemplates();
}

// ─── CONTACTS ─────────────────────────────────────────────────────────────────
let contactPage = 1;
async function renderContacts(page = 1) {
  contactPage = page;
  const el = document.getElementById('page-contacts');
  const search = document.getElementById('contact-search')?.value || '';
  const data = await api(`/contacts?page=${page}&limit=50${search ? '&search=' + search : ''}`);

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Contactos <small>${data.total.toLocaleString()} contactos en la base de datos</small></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="showUploadCsv()"><i class="fas fa-file-csv"></i> Subir CSV</button>
        <button class="btn btn-primary" onclick="newContact()"><i class="fas fa-plus"></i> Agregar</button>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:16px">
      <input class="input" id="contact-search" value="${search}" placeholder="🔍 Buscar por nombre o teléfono..." style="max-width:300px" oninput="renderContacts(1)">
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Teléfono</th><th>Nombre</th><th>Empresa</th><th>Email</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${data.contacts.map(c => `
              <tr>
                <td><code>${c.phone}</code></td>
                <td>${c.name || '–'}</td>
                <td>${c.company || '–'}</td>
                <td>${c.email || '–'}</td>
                <td>${c.optOut ? '<span class="badge badge-red">Opt-out</span>' : '<span class="badge badge-green">Activo</span>'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="optOut('${c._id}')"><i class="fas fa-ban"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="deleteContact('${c._id}')"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No se encontraron contactos</td></tr>'}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
        ${page > 1 ? `<button class="btn btn-ghost btn-sm" onclick="renderContacts(${page-1})">← Anterior</button>` : ''}
        <span style="color:var(--muted);font-size:13px;display:flex;align-items:center">Pág. ${page} de ${data.pages}</span>
        ${page < data.pages ? `<button class="btn btn-ghost btn-sm" onclick="renderContacts(${page+1})">Siguiente →</button>` : ''}
      </div>
    </div>`;
}

function showUploadCsv() {
  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">Subir base de datos CSV</div>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">El archivo debe tener columnas: <b>telefono</b> (requerido), nombre, empresa, email. Se admiten columnas extras.</p>
    <div class="dropzone" id="dropzone" onclick="document.getElementById('csv-input').click()" ondragover="event.preventDefault();this.classList.add('over')" ondrop="handleDrop(event)">
      <i class="fas fa-file-csv"></i>
      <div style="font-size:16px;font-weight:600;margin-bottom:4px">Arrastra tu CSV aquí</div>
      <div style="font-size:13px">o haz clic para seleccionar</div>
    </div>
    <input type="file" id="csv-input" accept=".csv" style="display:none" onchange="uploadCsv(this.files[0])">
    <div id="upload-result" style="margin-top:12px"></div>
  `);
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) uploadCsv(file);
}

async function uploadCsv(file) {
  const form = new FormData();
  form.append('file', file);
  document.getElementById('upload-result').innerHTML = '<div style="color:var(--muted);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Procesando...</div>';
  try {
    const res = await fetch('/api/contacts/upload-csv', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const data = await res.json();
    document.getElementById('upload-result').innerHTML = `
      <div class="card" style="padding:16px">
        <div style="color:var(--green)"><i class="fas fa-check-circle"></i> ✅ Nuevos: <b>${data.inserted}</b></div>
        <div style="color:var(--blue)"><i class="fas fa-sync"></i> Actualizados: <b>${data.updated}</b></div>
        ${data.errors ? `<div style="color:var(--red)"><i class="fas fa-exclamation"></i> Errores: <b>${data.errors}</b></div>` : ''}
      </div>`;
    renderContacts();
  } catch (e) { document.getElementById('upload-result').innerHTML = `<div style="color:var(--red)">${e.message}</div>`; }
}

function newContact() {
  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">Nuevo Contacto</div>
    <div class="form-group"><label class="label">Teléfono *</label><input class="input" id="c-phone" placeholder="521234567890"></div>
    <div class="form-group"><label class="label">Nombre</label><input class="input" id="c-name" placeholder="Juan Pérez"></div>
    <div class="form-group"><label class="label">Empresa</label><input class="input" id="c-company" placeholder="ACME Corp"></div>
    <div class="form-group"><label class="label">Email</label><input class="input" id="c-email" type="email" placeholder="juan@acme.com"></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="createContact()"><i class="fas fa-save"></i> Guardar</button>
  `);
}

async function createContact() {
  const body = { phone: document.getElementById('c-phone').value, name: document.getElementById('c-name').value, company: document.getElementById('c-company').value, email: document.getElementById('c-email').value };
  if (!body.phone) return toast('Teléfono requerido', 'error');
  await api('/contacts', { method: 'POST', body: JSON.stringify(body) });
  toast('Contacto creado', 'success'); closeModal(); renderContacts();
}

async function deleteContact(id) {
  if (!confirm('¿Eliminar contacto?')) return;
  await api(`/contacts/${id}`, { method: 'DELETE' });
  toast('Contacto eliminado', 'success'); renderContacts();
}

async function optOut(id) {
  await api(`/contacts/${id}/optout`, { method: 'POST' });
  toast('Marcado como opt-out', 'info'); renderContacts();
}

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
async function renderCampaigns() {
  const el = document.getElementById('page-campaigns');
  const campaigns = await api('/campaigns');
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Campañas <small>Envíos masivos de WhatsApp</small></div>
      <button class="btn btn-primary" onclick="newCampaign()"><i class="fas fa-plus"></i> Nueva campaña</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${campaigns.map(c => `
        <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:15px;margin-bottom:4px">${c.name}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
              ${statusBadge(c.status)}
              <span style="color:var(--muted);font-size:12px"><i class="fas fa-calendar"></i> ${fmtDate(c.createdAt)}</span>
            </div>
            ${c.status === 'running' ? `
              <div class="progress-bar" style="max-width:300px">
                <div class="progress-fill" id="progress-${c._id}" style="width:${c.totalContacts ? Math.round((c.sent+c.failed)/c.totalContacts*100) : 0}%"></div>
              </div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px" id="progress-txt-${c._id}">${c.sent+c.failed}/${c.totalContacts}</div>` : ''}
          </div>
          <div style="display:flex;gap:24px;text-align:center">
            <div><div style="font-size:20px;font-weight:700;color:var(--green)">${c.sent}</div><div style="font-size:11px;color:var(--muted)">Enviados</div></div>
            <div><div style="font-size:20px;font-weight:700;color:var(--red)">${c.failed}</div><div style="font-size:11px;color:var(--muted)">Fallidos</div></div>
            <div><div style="font-size:20px;font-weight:700">${c.totalContacts}</div><div style="font-size:11px;color:var(--muted)">Total</div></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="startCampaign('${c._id}')"><i class="fas fa-play"></i> Iniciar</button>` : ''}
            ${c.status === 'running' ? `<button class="btn btn-ghost btn-sm" onclick="pauseCampaign('${c._id}')"><i class="fas fa-pause"></i> Pausar</button>` : ''}
            ${c.status === 'paused' ? `<button class="btn btn-primary btn-sm" onclick="resumeCampaign('${c._id}')"><i class="fas fa-play"></i> Reanudar</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="navigate('reports');viewCampaignReport('${c._id}')"><i class="fas fa-chart-bar"></i> Reporte</button>
            ${c.status === 'draft' ? `<button class="btn btn-danger btn-sm" onclick="deleteCampaign('${c._id}')"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>`).join('') || '<div style="color:var(--muted);text-align:center;padding:40px">No hay campañas. ¡Crea una!</div>'}
    </div>`;
}

async function newCampaign() {
  const [templates, lines, contactsData] = await Promise.all([
    api('/templates'), api('/lines'), api('/contacts?limit=1')
  ]);

  openModal(`
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="modal-title">Nueva Campaña</div>
    <div class="form-group"><label class="label">Nombre de la campaña</label><input class="input" id="camp-name" placeholder="Campaña Junio 2024"></div>
    
    <div class="form-group">
      <label class="label">Plantillas (selecciona una o más — se rotarán)</label>
      <div class="multi-select-grid" id="tpl-select">
        ${templates.map(t => `
          <label class="check-card" onclick="toggleSelect(this)">
            <input type="checkbox" value="${t._id}" style="display:none">
            <i class="fas fa-file-alt"></i> ${t.name}
          </label>`).join('')}
      </div>
    </div>

    <div class="form-group">
      <label class="label">Líneas WhatsApp (se rotarán automáticamente)</label>
      <div class="multi-select-grid" id="line-select">
        ${lines.filter(l => l.status === 'connected').map(l => `
          <label class="check-card" onclick="toggleSelect(this)">
            <input type="checkbox" value="${l._id}" style="display:none">
            <span class="dot dot-green" style="margin-right:4px"></span> ${l.name}
          </label>`).join('') || '<p style="color:var(--red);font-size:13px">No hay líneas conectadas</p>'}
      </div>
    </div>

    <div class="form-group">
      <label class="label">Contactos a enviar</label>
      <div style="display:flex;gap:10px;align-items:center">
        <input class="input" id="camp-contact-search" placeholder="Buscar o dejar vacío = todos" oninput="searchCampContacts()">
        <span id="camp-contact-count" style="white-space:nowrap;color:var(--green);font-size:13px">${contactsData.total} contactos</span>
      </div>
      <input type="hidden" id="camp-contact-ids" value="all">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="label">Delay mínimo (seg)</label>
        <input class="input" id="delay-min" type="number" value="3" min="1">
      </div>
      <div class="form-group">
        <label class="label">Delay máximo (seg)</label>
        <input class="input" id="delay-max" type="number" value="10" min="2">
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin-top:-8px;margin-bottom:16px">⚠️ Se recomienda mínimo 3-5 segundos para evitar bloqueos</p>

    <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="createCampaign()"><i class="fas fa-paper-plane"></i> Crear campaña</button>
  `);
}

function toggleSelect(el) {
  el.classList.toggle('selected');
  el.querySelector('input').checked = !el.querySelector('input').checked;
}

async function createCampaign() {
  const name = document.getElementById('camp-name').value;
  const templates = [...document.querySelectorAll('#tpl-select input:checked')].map(i => i.value);
  const lines = [...document.querySelectorAll('#line-select input:checked')].map(i => i.value);

  if (!name) return toast('Escribe el nombre', 'error');
  if (!templates.length) return toast('Selecciona al menos una plantilla', 'error');
  if (!lines.length) return toast('Selecciona al menos una línea conectada', 'error');

  // Obtener todos los IDs de contactos activos
  const allContacts = await api('/contacts?limit=100000');
  const contactIds = allContacts.contacts.filter(c => !c.optOut).map(c => c._id);

  if (!contactIds.length) return toast('No hay contactos activos', 'error');

  await api('/campaigns', { method: 'POST', body: JSON.stringify({
    name, templates, lines, contactIds,
    delayMin: Number(document.getElementById('delay-min').value),
    delayMax: Number(document.getElementById('delay-max').value)
  }) });

  toast('Campaña creada', 'success'); closeModal(); renderCampaigns();
}

async function startCampaign(id) {
  await api(`/campaigns/${id}/start`, { method: 'POST' });
  toast('Campaña iniciada', 'success'); renderCampaigns();
}
async function pauseCampaign(id) {
  await api(`/campaigns/${id}/pause`, { method: 'POST' });
  toast('Campaña pausada', 'info'); renderCampaigns();
}
async function resumeCampaign(id) {
  await api(`/campaigns/${id}/resume`, { method: 'POST' });
  toast('Campaña reanudada', 'success'); renderCampaigns();
}
async function deleteCampaign(id) {
  if (!confirm('¿Eliminar campaña?')) return;
  await api(`/campaigns/${id}`, { method: 'DELETE' });
  toast('Campaña eliminada', 'success'); renderCampaigns();
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
async function renderReports() {
  const el = document.getElementById('page-reports');
  const campaigns = await api('/campaigns');
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Reportes <small>Detalle de envíos por campaña</small></div>
    </div>
    <div class="form-group" style="max-width:400px">
      <label class="label">Seleccionar campaña</label>
      <select class="select" id="report-camp-sel" onchange="viewCampaignReport(this.value)">
        <option value="">– Selecciona una campaña –</option>
        ${campaigns.map(c => `<option value="${c._id}">${c.name} (${c.status})</option>`).join('')}
      </select>
    </div>
    <div id="report-content"></div>`;
}

async function viewCampaignReport(id) {
  if (!id) return;
  const sel = document.getElementById('report-camp-sel');
  if (sel) sel.value = id;

  document.getElementById('report-content').innerHTML = '<div style="color:var(--muted);padding:20px"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const data = await api(`/messages/campaign/${id}`);

  const statsMap = {};
  data.stats.forEach(s => { statsMap[s._id] = s.count; });

  document.getElementById('report-content').innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card blue"><div class="stat-icon">📨</div><div class="stat-value">${statsMap.sent||0}</div><div class="stat-label">Enviados</div></div>
      <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-value">${statsMap.delivered||0}</div><div class="stat-label">Entregados</div></div>
      <div class="stat-card green"><div class="stat-icon">👁️</div><div class="stat-value">${statsMap.read||0}</div><div class="stat-label">Leídos</div></div>
      <div class="stat-card red"><div class="stat-icon">❌</div><div class="stat-value">${statsMap.failed||0}</div><div class="stat-label">Fallidos</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-size:15px">Detalle de mensajes (${data.total})</h3>
        <a href="/api/messages/campaign/${id}/export?token=${token}" class="btn btn-ghost btn-sm" download>
          <i class="fas fa-download"></i> Exportar CSV
        </a>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Teléfono</th><th>Nombre</th><th>Empresa</th><th>Plantilla</th><th>Línea</th><th>Estado</th><th>Enviado</th></tr></thead>
          <tbody>
            ${data.messages.map(m => `
              <tr>
                <td><code>${m.contact?.phone || m.phone}</code></td>
                <td>${m.contact?.name || '–'}</td>
                <td>${m.contact?.company || '–'}</td>
                <td>${m.template?.name || '–'}</td>
                <td>${m.line?.name || '–'}</td>
                <td>${statusBadge(m.status)}</td>
                <td style="color:var(--muted);font-size:12px">${fmtDate(m.sentAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── INBOX ────────────────────────────────────────────────────────────────────
async function renderInbox() {
  const el = document.getElementById('page-inbox');
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Inbox <small>Gestiona respuestas de clientes</small></div>
    </div>
    <div class="inbox-layout">
      <div class="conv-list">
        <div class="conv-search">
          <div class="tabs" style="margin-bottom:8px">
            <div class="tab active" onclick="filterConvs('open',this)">Abiertas</div>
            <div class="tab" onclick="filterConvs('assigned',this)">Mías</div>
            <div class="tab" onclick="filterConvs('closed',this)">Cerradas</div>
          </div>
          <input class="input" id="conv-search" placeholder="🔍 Buscar...">
        </div>
        <div id="conv-list-inner"></div>
      </div>
      <div class="chat-area" id="chat-area">
        <div class="chat-placeholder">
          <i class="fas fa-comments" style="font-size:48px;color:var(--border)"></i>
          <span>Selecciona una conversación</span>
        </div>
      </div>
    </div>`;

  await loadConvList('open');
  updateInboxBadge();
}

async function loadConvList(status = 'open') {
  const inner = document.getElementById('conv-list-inner');
  if (!inner) return;
  const param = status === 'assigned' ? 'assignedTo=me' : `status=${status}`;
  const data = await api(`/inbox/conversations?${param}&limit=50`);

  inner.innerHTML = data.conversations.map(c => `
    <div class="conv-item ${currentConvId === c._id ? 'active' : ''}" onclick="openConversation('${c._id}')">
      <div class="conv-meta">
        <div class="conv-name">${c.contactName || c.phone}</div>
        <div class="conv-time">${fmtRelative(c.lastMessageAt)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="conv-preview">${c.lastMessage || '–'}</div>
        ${c.unread > 0 ? `<span class="unread-badge">${c.unread}</span>` : ''}
      </div>
      <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
        ${statusBadge(c.status)}
        ${c.assignedTo ? `<span style="font-size:10px;color:var(--muted)">→ ${c.assignedTo.name}</span>` : ''}
      </div>
    </div>`).join('') || '<div style="color:var(--muted);text-align:center;padding:20px;font-size:13px">Sin conversaciones</div>';
}

let currentConvStatus = 'open';
function filterConvs(status, el) {
  currentConvStatus = status;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  loadConvList(status);
}

function refreshConvList() { loadConvList(currentConvStatus); }

async function openConversation(id) {
  currentConvId = id;
  document.querySelectorAll('.conv-item').forEach(c => c.classList.remove('active'));

  const conv = await api(`/inbox/conversations?limit=200`);
  const c = conv.conversations.find(x => x._id === id);
  if (!c) return;

  const chatArea = document.getElementById('chat-area');
  const isAssignedToMe = c.assignedTo?._id === currentUser?.id || c.assignedTo === currentUser?.id;
  const isUnassigned = !c.assignedTo;

  chatArea.innerHTML = `
    <div class="chat-header">
      <div>
        <div style="font-weight:700">${c.contactName || c.phone}</div>
        <div style="font-size:12px;color:var(--muted)">${c.phone} · ${statusBadge(c.status)}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${isUnassigned ? `<button class="btn btn-primary btn-sm" onclick="takeConversation('${id}')"><i class="fas fa-hand-pointer"></i> Tomar</button>` : ''}
        ${isAssignedToMe ? `<button class="btn btn-ghost btn-sm" onclick="releaseConversation('${id}')"><i class="fas fa-undo"></i> Liberar</button>` : ''}
        ${c.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" onclick="closeConversation('${id}')"><i class="fas fa-check"></i> Cerrar</button>` : ''}
      </div>
    </div>
    <div class="chat-messages" id="chat-messages-${id}">
      <div style="color:var(--muted);text-align:center;font-size:13px"><i class="fas fa-spinner fa-spin"></i></div>
    </div>
    ${isAssignedToMe ? `
    <div class="chat-input-area">
      <input class="input" id="chat-input-${id}" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter') sendChatMsg('${id}')">
      <button class="btn btn-primary" onclick="sendChatMsg('${id}')"><i class="fas fa-paper-plane"></i></button>
    </div>` : `<div style="padding:12px 20px;text-align:center;color:var(--muted);font-size:13px;border-top:1px solid var(--border)">
      ${c.assignedTo ? `Esta conversación está asignada a <b>${c.assignedTo.name}</b>` : 'Toma la conversación para responder'}
    </div>`}`;

  await loadChatMessages(id);

  // Highlight conv item
  document.querySelectorAll('.conv-item').forEach(el => {
    if (el.getAttribute('onclick')?.includes(id)) el.classList.add('active');
  });
}

async function loadChatMessages(id) {
  const container = document.getElementById(`chat-messages-${id}`);
  if (!container) return;

  const messages = await api(`/inbox/conversations/${id}/messages`);
  container.innerHTML = messages.map(m => `
    <div>
      <div class="msg-bubble ${m.direction}">
        ${m.content || '<i style="color:var(--muted)">[media]</i>'}
      </div>
      <div class="msg-time" style="text-align:${m.direction==='outbound'?'right':'left'}">
        ${fmtRelative(m.timestamp)} ${m.sentBy ? `· ${m.sentBy.name}` : ''}
      </div>
    </div>`).join('') || '<div style="color:var(--muted);text-align:center;font-size:13px">Sin mensajes</div>';

  container.scrollTop = container.scrollHeight;
  updateInboxBadge();
}

async function sendChatMsg(id) {
  const input = document.getElementById(`chat-input-${id}`);
  const content = input?.value?.trim();
  if (!content) return;
  input.value = '';
  try {
    await api(`/inbox/conversations/${id}/send`, { method: 'POST', body: JSON.stringify({ content }) });
    await loadChatMessages(id);
  } catch (e) { toast(e.message, 'error'); input.value = content; }
}

async function takeConversation(id) {
  await api(`/inbox/conversations/${id}/take`, { method: 'POST' });
  toast('Conversación asignada a ti', 'success');
  openConversation(id); refreshConvList();
}

async function releaseConversation(id) {
  await api(`/inbox/conversations/${id}/release`, { method: 'POST' });
  toast('Conversación liberada', 'info');
  openConversation(id); refreshConvList();
}

async function closeConversation(id) {
  await api(`/inbox/conversations/${id}/close`, { method: 'POST' });
  toast('Conversación cerrada', 'success');
  currentConvId = null;
  document.getElementById('chat-area').innerHTML = `<div class="chat-placeholder"><i class="fas fa-comments" style="font-size:48px;color:var(--border)"></i><span>Selecciona una conversación</span></div>`;
  refreshConvList();
}

async function updateInboxBadge() {
  try {
    const data = await api('/inbox/conversations?status=open&limit=1');
    const badge = document.getElementById('inbox-badge');
    if (badge) {
      if (data.total > 0) { badge.textContent = data.total; badge.style.display = 'inline'; }
      else badge.style.display = 'none';
    }
  } catch {}
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
if (token) startApp();
