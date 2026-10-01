const API_BASE = '/api';
const TOKEN_KEY = 'pulsemd_admin_token';
const USER_KEY = 'pulsemd_admin_user';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: readJson(localStorage.getItem(USER_KEY)),
  doctors: [],
  patients: [],
  appointments: [],
  emergencies: [],
  uploads: [],
  payments: [],
  analytics: null
};

const $ = (id) => document.getElementById(id);

function readJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function statusClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function showToast(message, isError = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.background = isError ? '#991b1b' : '#0f172a';
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) logout(false);
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

function syncUserHeader() {
  if (state.user) {
    $('adminName').textContent = state.user.name || 'Admin';
    $('adminEmailText').textContent = state.user.email || 'admin';
  }
}

async function logout(showMessage = true) {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  state.token = '';
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (showMessage) showToast('Logged out.');
  window.location.href = '/admin-login.html';
}

async function loadAll() {
  await Promise.all([
    loadOverview(),
    loadDoctors(),
    loadPatients(),
    loadAppointments(),
    loadEmergencies(),
    loadUploads(),
    loadPayments(),
    loadAnalytics()
  ]);
}

async function loadOverview() {
  const data = await api('/admin/overview');
  const cards = data.cards || {};
  $('totalDoctors').textContent = cards.totalDoctors || 0;
  $('totalPatients').textContent = cards.totalPatients || 0;
  $('totalAppointments').textContent = cards.appointments || 0;
  $('totalEmergency').textContent = cards.emergencyAlerts || 0;
  $('totalUploads').textContent = cards.uploads || 0;
  $('totalAi').textContent = cards.aiChecks || 0;
  $('totalRevenue').textContent = `Rs. ${cards.revenue || 0}`;
  $('pendingDoctors').textContent = `${cards.pendingDoctors || 0} pending verification`;
  renderRecent(data.recentAppointments || [], data.recentEmergencies || []);
}

function renderRecent(appointments, emergencies) {
  $('recentAppointments').innerHTML = appointments.length ? appointments.map((item) => `
    <div class="mini-card">
      <strong>${escapeHtml(item.patient?.name || 'Patient')} with ${escapeHtml(item.doctor?.name || 'Doctor')}</strong>
      <span>${formatDate(item.scheduledAt)} - ${escapeHtml(item.status)}</span>
    </div>
  `).join('') : '<div class="mini-card"><strong>No appointments yet</strong><span>Bookings will appear here.</span></div>';

  $('recentEmergencies').innerHTML = emergencies.length ? emergencies.map((item) => `
    <div class="mini-card">
      <strong>${escapeHtml(item.patientName || item.patient?.name || 'Patient')}</strong>
      <span>${escapeHtml(item.type)} - ${escapeHtml(item.status)}</span>
    </div>
  `).join('') : '<div class="mini-card"><strong>No emergency alerts</strong><span>All clear right now.</span></div>';
}

async function loadDoctors() {
  state.doctors = await api('/admin/doctors');
  renderDoctors();
}

function renderDoctors() {
  const query = $('doctorSearch').value.trim().toLowerCase();
  const rows = state.doctors.filter((doctor) => {
    const haystack = `${doctor.user?.name} ${doctor.user?.email} ${doctor.specialization} ${doctor.verificationStatus}`.toLowerCase();
    return haystack.includes(query);
  });

  $('doctorTable').innerHTML = rows.map((doctor) => `
    <tr>
      <td><strong>${escapeHtml(doctor.user?.name || 'Doctor')}</strong><span class="small">${escapeHtml(doctor.user?.email || '')}</span></td>
      <td>${escapeHtml(doctor.specialization || doctor.user?.specialty || '-')}<span class="small">${escapeHtml(doctor.city || 'Online')}</span></td>
      <td>Rs. ${escapeHtml(doctor.fee || doctor.user?.consultationFee || 0)}</td>
      <td><span class="status ${statusClass(doctor.verificationStatus)}">${escapeHtml(doctor.verificationStatus)}</span></td>
      <td>
        <div class="action-row">
          <button class="action-btn approve" data-doctor-action="verified" data-id="${doctor._id}">Approve</button>
          <button class="action-btn warn" data-doctor-action="pending_review" data-id="${doctor._id}">Pending</button>
          <button class="action-btn reject" data-doctor-action="rejected" data-id="${doctor._id}">Reject</button>
          <button class="action-btn" data-edit-user="${doctor.user?._id}" data-user='${escapeHtml(JSON.stringify(doctor.user || {}))}'>Edit</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateDoctorVerification(id, status) {
  await api(`/admin/doctors/${id}/verification`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showToast(`Doctor marked as ${status}.`);
  await Promise.all([loadOverview(), loadDoctors()]);
}

async function loadPatients() {
  state.patients = await api('/admin/patients');
  renderPatients();
}

function renderPatients() {
  const query = $('patientSearch').value.trim().toLowerCase();
  const rows = state.patients.filter((patient) => `${patient.name} ${patient.email} ${patient.phone}`.toLowerCase().includes(query));
  $('patientTable').innerHTML = rows.map((patient) => `
    <tr>
      <td><strong>${escapeHtml(patient.name)}</strong><span class="small">${escapeHtml(patient.profile?.gender || '')}</span></td>
      <td>${escapeHtml(patient.email)}</td>
      <td>${escapeHtml(patient.phone || '-')}</td>
      <td>${formatDate(patient.createdAt)}</td>
      <td>
        <div class="action-row">
          <button class="action-btn" data-edit-user="${patient._id}" data-user='${escapeHtml(JSON.stringify(patient))}'>Edit</button>
          <button class="action-btn delete" data-delete-user="${patient._id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteUser(id) {
  if (!window.confirm('Delete this user and related profile?')) return;
  await api(`/admin/users/${id}`, { method: 'DELETE' });
  showToast('User deleted.');
  await Promise.all([loadOverview(), loadPatients(), loadDoctors()]);
}

function openEditModal(user) {
  $('editUserId').value = user._id || '';
  $('editName').value = user.name || '';
  $('editPhone').value = user.phone || '';
  $('editSpecialty').value = user.specialty || '';
  $('editFee').value = user.consultationFee || '';
  $('editModal').classList.remove('hidden');
}

async function saveUser(event) {
  event.preventDefault();
  const id = $('editUserId').value;
  await api(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: $('editName').value.trim(),
      phone: $('editPhone').value.trim(),
      specialty: $('editSpecialty').value.trim(),
      consultationFee: Number($('editFee').value || 0)
    })
  });
  $('editModal').classList.add('hidden');
  showToast('User updated.');
  await Promise.all([loadDoctors(), loadPatients()]);
}

async function loadAppointments() {
  state.appointments = await api('/admin/appointments');
  renderAppointments();
}

function renderAppointments() {
  const query = $('appointmentSearch').value.trim().toLowerCase();
  const rows = state.appointments.filter((item) => `${item.patient?.name} ${item.doctor?.name} ${item.status} ${item.paymentStatus}`.toLowerCase().includes(query));
  $('appointmentTable').innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.patient?.name || '-')}<span class="small">${escapeHtml(item.reason || '')}</span></td>
      <td>${escapeHtml(item.doctor?.name || '-')}</td>
      <td>${formatDate(item.scheduledAt)}</td>
      <td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td><span class="status ${statusClass(item.paymentStatus)}">${escapeHtml(item.paymentStatus)}</span></td>
      <td>
        <div class="action-row">
          <select data-appointment-status="${item._id}">
            ${['pending', 'payment_pending', 'confirmed', 'completed', 'cancelled'].map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateAppointment(id, status) {
  await api(`/admin/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showToast('Appointment updated.');
  await Promise.all([loadOverview(), loadAppointments()]);
}

async function loadEmergencies() {
  state.emergencies = await api('/admin/emergencies');
  renderEmergencies();
}

function renderEmergencies() {
  $('emergencyTable').innerHTML = state.emergencies.map((item) => `
    <tr>
      <td>${escapeHtml(item.patientName || item.patient?.name || '-')}<span class="small">${escapeHtml(item.message || '')}</span></td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.emergencyContactName || '-')}<span class="small">${escapeHtml(item.emergencyContactPhone || '')}</span></td>
      <td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td>${item.location?.mapsUrl ? `<a href="${escapeHtml(item.location.mapsUrl)}" target="_blank" rel="noreferrer">Open Map</a>` : '-'}</td>
      <td>
        <select data-emergency-status="${item._id}">
          ${['ACTIVE', 'HANDLED', 'RESOLVED', 'CLOSED', 'CANCELLED'].map((status) => `<option value="${status}" ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

async function updateEmergency(id, status) {
  await api(`/admin/emergencies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showToast('Emergency alert updated.');
  await Promise.all([loadOverview(), loadEmergencies()]);
}

async function loadUploads() {
  state.uploads = await api('/admin/uploads');
  $('uploadTable').innerHTML = state.uploads.map((item) => `
    <tr>
      <td>${escapeHtml(item.owner?.name || '-')}<span class="small">${escapeHtml(item.owner?.role || '')}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.fileName || 'Open file')}</a>` : escapeHtml(item.fileName || '-')}</td>
      <td>${escapeHtml(item.mimeType || item.resourceType || '-')}</td>
      <td>${formatDate(item.createdAt)}</td>
    </tr>
  `).join('');
}

async function loadPayments() {
  state.payments = await api('/admin/payments');
  $('paymentTable').innerHTML = state.payments.map((item) => `
    <tr>
      <td>${escapeHtml(item.patientName || '-')}</td>
      <td>${escapeHtml(item.doctorName || '-')}</td>
      <td>Rs. ${escapeHtml(item.amount || 0)}</td>
      <td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
      <td>${formatDate(item.createdAt || item.paymentDate)}</td>
    </tr>
  `).join('');
}

async function loadAnalytics() {
  state.analytics = await api('/admin/analytics');
  renderChart('usersChart', state.analytics.usersByRole || []);
  renderChart('appointmentsChart', state.analytics.appointmentsByStatus || []);
  renderChart('paymentsChart', state.analytics.paymentsByStatus || []);
  renderChart('aiChart', state.analytics.aiByUrgency || []);
}

function renderChart(id, rows) {
  const max = Math.max(1, ...rows.map((row) => row.count || 0));
  $(id).innerHTML = rows.length ? rows.map((row) => {
    const count = row.count || 0;
    const width = Math.max(4, Math.round((count / max) * 100));
    return `
      <div class="bar-row">
        <strong>${escapeHtml(row._id || 'unknown')}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        <span>${count}</span>
      </div>
    `;
  }).join('') : '<div class="mini-card"><strong>No data yet</strong><span>Analytics will appear after activity.</span></div>';
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('active'));
  $(`${view}View`).classList.add('active');
  $('pageTitle').textContent = view.charAt(0).toUpperCase() + view.slice(1);
  document.querySelectorAll('.side-nav a').forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  closeMenu();
}

function closeMenu() {
  $('sidebar').classList.remove('open');
  $('overlay').classList.remove('show');
}

function bindEvents() {
  $('logoutBtn').addEventListener('click', () => logout(true));
  $('refreshBtn').addEventListener('click', () => loadAll().then(() => showToast('Data refreshed.')).catch((error) => showToast(error.message, true)));
  $('menuBtn').addEventListener('click', () => {
    $('sidebar').classList.add('open');
    $('overlay').classList.add('show');
  });
  $('overlay').addEventListener('click', closeMenu);
  $('closeModal').addEventListener('click', () => $('editModal').classList.add('hidden'));
  $('editForm').addEventListener('submit', saveUser);

  document.querySelectorAll('.side-nav a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      switchView(link.dataset.view);
    });
  });

  $('doctorSearch').addEventListener('input', renderDoctors);
  $('patientSearch').addEventListener('input', renderPatients);
  $('appointmentSearch').addEventListener('input', renderAppointments);

  document.body.addEventListener('click', async (event) => {
    const doctorButton = event.target.closest('[data-doctor-action]');
    const editButton = event.target.closest('[data-edit-user]');
    const deleteButton = event.target.closest('[data-delete-user]');

    try {
      if (doctorButton) await updateDoctorVerification(doctorButton.dataset.id, doctorButton.dataset.doctorAction);
      if (editButton) openEditModal(JSON.parse(editButton.dataset.user || '{}'));
      if (deleteButton) await deleteUser(deleteButton.dataset.deleteUser);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.body.addEventListener('change', async (event) => {
    try {
      if (event.target.matches('[data-appointment-status]')) {
        await updateAppointment(event.target.dataset.appointmentStatus, event.target.value);
      }
      if (event.target.matches('[data-emergency-status]')) {
        await updateEmergency(event.target.dataset.emergencyStatus, event.target.value);
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

bindEvents();
syncUserHeader();
loadAll().catch((error) => {
  showToast(error.message, true);
  if (/token|access|authoriz/i.test(error.message)) {
    window.location.href = '/admin-login.html';
  }
});
