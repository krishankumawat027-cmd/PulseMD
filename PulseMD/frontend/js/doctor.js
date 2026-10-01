let doctorSocket;
let doctorRoom;
let doctorPeer;
let doctorStream;
let doctorNotificationFilter = 'all';
let doctorChatStatus = 'open';

function doctorPhrase(value) {
  return App.translatePhrase(value);
}

function doctorKey(key, fallback = '') {
  const translated = App.t(key);
  return translated === key.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ')
    ? doctorPhrase(fallback || translated)
    : translated;
}

function translatedStatus(value) {
  return App.tStatus(value);
}

function setDoctorStatus(selector, message, isError = false) {
  const node = $(selector);
  if (!node) return;
  node.textContent = doctorPhrase(message);
  node.classList.toggle('error', isError);
}

function setActionLoading(button, isLoading, loadingLabel = 'Loading...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.disabled = true;
    button.textContent = doctorPhrase(loadingLabel);
    return;
  }
  button.disabled = false;
  if (button.dataset.originalText) button.textContent = doctorPhrase(button.dataset.originalText);
}

function requireDoctor() {
  const user = App.requireAuth();
  if (!user) return null;
  if (user.role !== 'doctor') {
    alert(doctorPhrase('Doctor access only.'));
    window.location.href = '/doctors.html';
    return null;
  }
  return user;
}

function doctorShell(active) {
  const unread = Number(localStorage.getItem('doctorUnread') || 0);
  document.body.classList.add('doctor-app');
  if (document.querySelector('.doctor-sidebar')) {
    App.initTheme();
    App.applyLanguage();
    mountDoctorNotificationBell();
    connectDoctorNotifications();
    loadDoctorNotificationCount();
    return;
  }
  document.body.insertAdjacentHTML('afterbegin', `
    <button type="button" class="doctor-sidebar-toggle" aria-label="Open doctor menu" data-i18n-aria-label="phrases.Open doctor menu" aria-expanded="false" onclick="toggleDoctorSidebar()">
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
      <span class="hamburger-line"></span>
    </button>
    <div class="doctor-sidebar-overlay" onclick="closeDoctorSidebar()"></div>
    <aside class="sidebar doctor-sidebar" aria-label="Doctor dashboard navigation">
      <div class="brand">
        <div class="brand-badge"><span>Pulse</span><span>MD</span></div>
        <div>
          <strong data-i18n="home.brandName">PulseMD - Virtual Clinic</strong>
          <span data-i18n="home.tagline">Healthcare that comes to you</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        <a class="${active === 'dashboard' ? 'active' : ''}" href="/doctor-dashboard.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('dashboard')}</span><span data-i18n="common.dashboard">${App.t('common.dashboard')}</span></a>
        <a class="${active === 'patients' ? 'active' : ''}" href="/doctor-patients.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('patients')}</span><span data-i18n="common.patients">${App.t('common.patients')}</span></a>
        <a class="${active === 'chat' ? 'active' : ''}" href="/doctor-chat.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('chat')}</span><span data-i18n="common.chat">${App.t('common.chat')}</span> <span class="badge doctor-unread-badge" ${unread ? '' : 'hidden'}>${unread}</span></a>
        <a class="${active === 'video' ? 'active' : ''}" href="/doctor-video.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('video')}</span><span data-i18n="common.video">${App.t('common.video')}</span></a>
        <a class="${active === 'appointments' ? 'active' : ''}" href="/doctor-appointments.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('appointments')}</span><span data-i18n="common.appointments">${App.t('common.appointments')}</span></a>
        <a class="${active === 'prescriptions' ? 'active' : ''}" href="/doctor-prescription.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('prescriptions')}</span><span data-i18n="common.prescriptions">${App.t('common.prescriptions')}</span></a>
        <a class="${active === 'payments' ? 'active' : ''}" href="/doctor-payments.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('payments')}</span><span data-i18n="common.payments">${App.t('common.payments')}</span></a>
        <a class="${active === 'notifications' ? 'active' : ''}" href="/doctor-notifications.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('notifications')}</span><span data-i18n="common.notifications">${App.t('common.notifications')}</span> <span class="badge doctor-unread-badge" ${unread ? '' : 'hidden'}>${unread}</span></a>
        <a class="${active === 'profile' ? 'active' : ''}" href="/doctor-profile.html" onclick="closeDoctorSidebar()"><span class="patient-nav-icon">${App.medIcon('profile')}</span><span data-i18n="common.profile">${App.t('common.profile')}</span></a>
        ${App.languageSelect()}
        <button type="button" data-theme-toggle onclick="App.toggleTheme()"><span class="patient-nav-icon">${App.medIcon('theme')}</span><span data-i18n="common.darkMode">${App.t('common.darkMode')}</span></button>
        <a href="#" onclick="App.logout(); return false;"><span class="patient-nav-icon">${App.medIcon('logout')}</span><span data-i18n="common.logout">${App.t('common.logout')}</span></a>
      </nav>
    </aside>
  `);
  document.addEventListener('keydown', closeDoctorSidebarOnEscape);
  App.initTheme();
  App.applyLanguage();
  mountDoctorNotificationBell();
  connectDoctorNotifications();
  loadDoctorNotificationCount();
}

function mountDoctorNotificationBell() {
  if ($('#doctorNotificationDropdown')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="doctor-global-notification">
      <button type="button" class="icon-button notification-icon-button" aria-label="Doctor notifications" aria-expanded="false" onclick="toggleDoctorNotificationDropdown(event)">
        <span class="ui-icon emoji-icon" aria-hidden="true">&#x1F514;</span>
        <span id="doctorNotificationBadge" class="badge notification-badge" hidden>0</span>
      </button>
      <div id="doctorNotificationDropdown" class="notification-dropdown" hidden>
        <div class="notification-dropdown-head">
          <strong data-i18n="common.notifications">${App.t('common.notifications')}</strong>
          <a href="/doctor-notifications.html" data-i18n="phrases.View all">${App.t('phrases.View all')}</a>
        </div>
        <div id="doctorNotificationDropdownList" class="notification-dropdown-list"></div>
      </div>
    </div>
  `);
}

function toggleDoctorSidebar() {
  const isOpen = document.body.classList.toggle('doctor-sidebar-open');
  const button = document.querySelector('.doctor-sidebar-toggle');
  if (button) {
    button.setAttribute('aria-expanded', String(isOpen));
    button.setAttribute('aria-label', isOpen ? 'Close doctor menu' : 'Open doctor menu');
  }
}

function closeDoctorSidebar() {
  document.body.classList.remove('doctor-sidebar-open');
  const button = document.querySelector('.doctor-sidebar-toggle');
  if (button) {
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open doctor menu');
  }
}

function closeDoctorSidebarOnEscape(event) {
  if (event.key === 'Escape') closeDoctorSidebar();
}

function connectDoctorNotifications() {
  if (window.__doctorNotificationsConnected && doctorSocket?.connected) return;
  if (window.__doctorNotificationsConnected && doctorSocket) return;
  window.__doctorNotificationsConnected = true;
  doctorSocket = App.socket();
  doctorSocket.on('connect', () => doctorSocket.emit('doctorNotifications'));
  doctorSocket.on('doctorNotification', async (notice) => {
    if (notice?.type === 'emergency_alert') playEmergencyAlertSound();
    await refreshDoctorNotificationSurfaces();
    if ($('#patientIntakeRequests')) await loadDoctorIntakeRequests();
    if ($('#activeEmergencyRequests')) await loadActiveEmergencies();
  });
  doctorSocket.on('patientNotification', async (notice) => {
    await refreshDoctorNotificationSurfaces();
  });
  doctorSocket.on('appointmentNotification', async (notice) => {
    await refreshDoctorNotificationSurfaces();
    if ($('#doctorUpcomingAppointments')) await loadDoctorUpcomingAppointments();
  });
  doctorSocket.on('doctorNotificationRead', async () => {
    await refreshDoctorNotificationSurfaces();
  });
}

function updateDoctorNotificationBadges(count = Number(localStorage.getItem('doctorUnread') || 0)) {
  document.querySelectorAll('.doctor-unread-badge, #doctorNotificationBadge').forEach((badge) => {
    if (!badge) return;
    badge.hidden = count <= 0;
    badge.textContent = count;
  });
}

function playEmergencyAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
  } catch (error) {
    console.warn('Emergency alert sound could not play:', error.message);
  }
}

async function initDoctorDashboard() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('dashboard');
  connectDoctorNotifications();
  try {
    const data = await App.request('/api/doctor/dashboard');
    $('#doctorName').textContent = data.profile?.user?.name || user.name;
    const doctorInitials = (data.profile?.user?.name || user.name || 'Doctor').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const profileAvatar = document.querySelector('.dashboard-profile-chip .avatar');
    const profileLabel = document.querySelector('.dashboard-profile-chip span');
    const profileHeroAvatar = $('#doctorProfileAvatar');
    const profileHeroName = $('#doctorProfileName');
    if (profileAvatar) {
      profileAvatar.textContent = doctorInitials;
      profileAvatar.dataset.initials = doctorInitials;
    }
    if (profileHeroAvatar) {
      profileHeroAvatar.textContent = doctorInitials;
      profileHeroAvatar.dataset.initials = doctorInitials;
    }
    if (profileLabel) profileLabel.textContent = `Dr. ${data.profile?.user?.name || user.name || 'Doctor'}`;
    if (profileHeroName) profileHeroName.textContent = `Dr. ${data.profile?.user?.name || user.name || 'Doctor'}`;
    $('#doctorEmail').textContent = data.profile?.user?.email || user.email;
    $('#doctorSpecialty').textContent = data.profile?.specialization || doctorPhrase('General Medicine');
    $('#doctorBio').textContent = data.profile?.bio || doctorPhrase('Ready for online consultations.');
    $('#availability').checked = data.profile?.availabilityStatus === 'available';
    $('#availabilityLabel').textContent = data.profile?.availabilityStatus === 'available' ? doctorPhrase('Online') : doctorPhrase('Offline');
    renderAvailabilityState(data.availability);
    hydrateAvailabilitySchedule(data.profile?.availabilitySchedule);
    renderDoctorVerification(data.profile);
    $('#pendingCount').textContent = data.stats.pendingRequests || data.stats.pendingAppointments || 0;
    $('#todayCount').textContent = data.stats.todaysAppointments;
    if ($('#totalPatientsCount')) $('#totalPatientsCount').textContent = data.stats.totalPatients || 0;
    if ($('#dashboardTotalEarnings')) $('#dashboardTotalEarnings').textContent = formatDoctorINR(data.stats.totalEarnings || 0);
    if ($('#unreadNotificationsCount')) $('#unreadNotificationsCount').textContent = data.stats.unreadNotifications || 0;
    if ($('#activeChatsCount')) $('#activeChatsCount').textContent = data.stats.activeChats || 0;
    if ($('#closedChatsCount')) $('#closedChatsCount').textContent = data.stats.closedChats || 0;
    if ($('#reopenedChatsCount')) $('#reopenedChatsCount').textContent = data.stats.reopenedChats || 0;
    if (data.demoDataSeeded) setDoctorStatus('#availabilitySaveStatus', 'Demo data added so your dashboard is not blank.');

    await loadDoctorNotificationCount();
    await loadDoctorIntakeRequests();
    await loadDoctorDashboardNotifications();
    await loadDoctorUpcomingAppointments();
    await loadDoctorNotificationDropdown();
    await loadActiveEmergencies();
    await loadDoctorEarnings();
    await renderPatients('#incomingPatients', 3);
  } catch (error) {
    const dashboardGrid = document.querySelector('.doctor-dashboard-grid');
    if (dashboardGrid) {
      dashboardGrid.insertAdjacentHTML('afterbegin', `<article class="doctor-card verification-notice"><h2>${escapeHtml(App.translatePhrase('Dashboard unavailable'))}</h2><p>${escapeHtml(App.translatePhrase(error.message))}</p></article>`);
    }
  }
}

window.renderDoctorsI18n = async () => {
  await App.applyLanguage();
  if ($('#doctorDashboardNotifications')) await loadDoctorDashboardNotifications();
  if ($('#doctorUpcomingAppointments')) await loadDoctorUpcomingAppointments();
  if ($('#doctorNotificationDropdownList')) await loadDoctorNotificationDropdown();
  if ($('#patientIntakeRequests')) await loadDoctorIntakeRequests();
  if ($('#activeEmergencyRequests')) await loadActiveEmergencies();
  if ($('#earningsTransactionsBody') || $('#earningsChart')) await loadDoctorEarnings();
  if ($('#incomingPatients')) await renderPatients('#incomingPatients', 3);
  if ($('#appointmentsBody')) await loadDoctorAppointments();
};

async function loadDoctorNotificationCount() {
  try {
    const data = await App.request('/api/doctor/notifications');
    localStorage.setItem('doctorUnread', String(data.unreadCount || 0));
    updateDoctorNotificationBadges(data.unreadCount || 0);
  } catch (error) {
    updateDoctorNotificationBadges();
  }
}

async function fetchDoctorNotifications() {
  const data = await App.request('/api/doctor/notifications');
  localStorage.setItem('doctorUnread', String(data.unreadCount || 0));
  updateDoctorNotificationBadges(data.unreadCount || 0);
  return data.notifications || [];
}

async function loadDoctorDashboardNotifications() {
  const list = $('#doctorDashboardNotifications');
  if (!list) return;

  try {
    const notifications = await fetchDoctorNotifications();
    const latest = notifications.slice(0, 5);
    if (!latest.length) {
      list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('No notifications yet.'))}</p>`;
      return;
    }
    list.innerHTML = latest.map((item) => doctorNotificationCard(item, { compact: true })).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadDoctorUpcomingAppointments() {
  const list = $('#doctorUpcomingAppointments');
  if (!list) return;

  list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('Loading appointments...'))}</p>`;

  try {
    const appointments = await App.request('/api/doctor/appointments');
    const now = Date.now();
    const upcoming = appointments
      .filter((item) => {
        const scheduledTime = new Date(item.scheduledAt).getTime();
        const status = String(item.status || '').toLowerCase();
        return Number.isFinite(scheduledTime)
          && scheduledTime >= now
          && !['completed', 'cancelled', 'canceled', 'rejected'].includes(status);
      })
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, 4);

    if (!upcoming.length) {
      list.innerHTML = `
        <article class="upcoming-appointment-empty">
          <strong>${escapeHtml(doctorPhrase('No upcoming appointments'))}</strong>
          <span>${escapeHtml(doctorPhrase('New booked consultations will appear here.'))}</span>
        </article>
      `;
      return;
    }

    list.innerHTML = upcoming.map((item) => upcomingAppointmentCard(item)).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message || doctorPhrase('Could not load appointments.'))}</p>`;
  }
}

function upcomingAppointmentCard(item = {}) {
  const patientName = item.patient?.name || doctorPhrase('Patient');
  const memberLine = item.familyMemberId
    ? `${doctorPhrase('For')} ${item.familyMemberId.fullName || doctorPhrase('Family member')} (${item.familyMemberId.relation || doctorPhrase('Member')})`
    : '';
  const initials = patientName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'PT';
  const scheduledAt = new Date(item.scheduledAt);
  const dateLabel = Number.isNaN(scheduledAt.getTime()) ? doctorPhrase('Date pending') : scheduledAt.toLocaleDateString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
  const timeLabel = Number.isNaN(scheduledAt.getTime()) ? doctorPhrase('Time pending') : scheduledAt.toLocaleTimeString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit'
  });
  const status = item.status || 'pending';
  const paymentStatus = item.paymentStatus || 'pending';

  return `
    <article class="upcoming-appointment-card">
      <div class="upcoming-date-tile">
        <strong>${escapeHtml(dateLabel)}</strong>
        <span>${escapeHtml(timeLabel)}</span>
      </div>
      <div class="upcoming-appointment-body">
        <div class="upcoming-appointment-head">
          <div class="avatar avatar-fallback" data-initials="${escapeForAttr(initials)}">${escapeHtml(initials)}</div>
          <div>
            <h3>${escapeHtml(patientName)}</h3>
            ${memberLine ? `<p class="muted">${escapeHtml(memberLine)}</p>` : ''}
          </div>
        </div>
        <p class="upcoming-reason">${escapeHtml(item.reason || doctorPhrase('General consultation'))}</p>
        <div class="upcoming-appointment-meta">
          <span class="status-pill ${escapeForClass(status)}">${escapeHtml(translatedStatus(status))}</span>
          <span class="status-pill ${escapeForClass(paymentStatus)}">${escapeHtml(translatedStatus(paymentStatus))}</span>
          <span>${escapeHtml(formatMoney(item.consultationFee))}</span>
        </div>
      </div>
      <div class="upcoming-appointment-actions">
        <a class="button secondary" href="/doctor-appointments.html">${escapeHtml(doctorPhrase('Manage'))}</a>
        <button type="button" onclick="createPrescriptionFor('${item.patient?._id || item.patient || ''}', '${escapeForAttr(patientName)}', '${item._id || ''}', '${escapeForAttr(item.familyMemberId?._id || '')}', '${escapeForAttr(item.familyMemberId?.fullName || '')}')">💊</button>
      </div>
    </article>
  `;
}

async function loadDoctorNotificationDropdown() {
  const list = $('#doctorNotificationDropdownList');
  if (!list) return;

  try {
    const notifications = await fetchDoctorNotifications();
    const latest = notifications.slice(0, 5);
    list.innerHTML = latest.length
      ? latest.map((item) => doctorNotificationCard(item, { compact: true, dropdown: true })).join('')
      : `<p class="muted">${escapeHtml(doctorPhrase('No notifications yet.'))}</p>`;
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadDoctorIntakeRequests() {
  const list = $('#patientIntakeRequests');
  if (!list) return;

  try {
    const user = App.user || JSON.parse(localStorage.getItem('user') || '{}');
    let requests = [];
    try {
      const cases = await App.request(`/api/doctor/cases/${user._id}`);
      requests = cases.map(normalizePatientCaseForUi);
    } catch (caseError) {
      requests = await App.request('/api/doctor/requests');
    }
    const visible = requests.filter((item) => ['waiting', 'later', 'pending'].includes(item.status)).slice(0, 6);
    if (!visible.length) {
      list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('No new AI intake requests.'))}</p>`;
      return;
    }

    list.innerHTML = visible.map((item) => {
      const detailId = getPatientRequestDetailId(item);
      console.info('Rendering patient request card:', {
        detailId,
        caseId: item.caseId || null,
        requestId: item.requestId || item.intakeRequestId || null,
        patientId: item.patientId?._id || item.patientId || null
      });
      return `
      <article class="request-card">
        <div class="request-card-head">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p class="muted">${escapeHtml(item.symptoms).slice(0, 76)}${item.symptoms.length > 76 ? '...' : ''}</p>
          </div>
          <span class="status-pill severity-${escapeForClass(item.severity)}">${escapeHtml(translatedStatus(item.severity))}</span>
        </div>
        <p class="muted">${formatDateTime(item.createdAt)}</p>
        <div class="actions">
          <a class="button secondary" href="/doctor-request.html?id=${escapeForAttr(detailId)}" onclick="console.info('Clicked patient request details:', '${escapeForAttr(detailId)}')">${escapeHtml(doctorPhrase('View Details'))}</a>
          <button type="button" onclick="joinIntakeRequest('${escapeForAttr(detailId)}')">${escapeHtml(doctorPhrase('Join Chat'))}</button>
        </div>
      </article>
    `;
    }).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadActiveEmergencies() {
  const list = $('#activeEmergencyRequests');
  if (!list) return;

  try {
    const emergencies = await App.request('/api/doctor/emergencies/active');
    if (!emergencies.length) {
      list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('No active emergency requests.'))}</p>`;
      return;
    }

    list.innerHTML = emergencies.slice(0, 6).map((item) => `
      <article class="request-card emergency-request-card">
        <div class="request-card-head">
          <div>
            <h3>${escapeHtml(item.patientName || item.patient?.name || doctorPhrase('Patient'))}</h3>
            <p class="muted">${escapeHtml(item.message ? doctorPhrase(item.message) : doctorPhrase('Emergency help requested.'))}</p>
          </div>
          <span class="status-pill severe">${escapeHtml(doctorPhrase('Emergency'))}</span>
        </div>
        <div class="request-meta-grid">
          <span>${escapeHtml(doctorPhrase('Contact'))}: ${escapeHtml(item.emergencyContactName || doctorPhrase('Saved contact'))}</span>
          <span>${escapeHtml(item.emergencyContactPhone || doctorPhrase('Phone unavailable'))}</span>
          <span>${formatDateTime(item.createdAt || item.triggeredAt)}</span>
        </div>
        ${item.location?.latitude && item.location?.longitude ? `<a class="button secondary" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(item.location.latitude)},${encodeURIComponent(item.location.longitude)}">${escapeHtml(doctorPhrase('Open Location'))}</a>` : ''}
        <div class="actions">
          ${item.emergencyContactPhone ? `<a class="button secondary" href="tel:${escapeForAttr(item.emergencyContactPhone)}">${escapeHtml(doctorPhrase('Call Now'))}</a>` : ''}
          <button type="button" onclick="updateEmergencyStatus('${item._id}', 'RESOLVED', event)">${escapeHtml(doctorPhrase('Mark Resolved'))}</button>
          <button type="button" class="danger" onclick="updateEmergencyStatus('${item._id}', 'CLOSED', event)">${escapeHtml(doctorPhrase('Close'))}</button>
        </div>
      </article>
    `).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

async function updateEmergencyStatus(id, status, event) {
  const button = event?.currentTarget;
  try {
    setActionLoading(button, true, 'Updating...');
    await App.request(`/api/doctor/emergencies/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await loadActiveEmergencies();
    await refreshDoctorNotificationSurfaces();
  } catch (error) {
    alert(error.message);
  } finally {
    setActionLoading(button, false);
  }
}

async function loadDoctorEarnings(event) {
  event?.preventDefault();
  const status = $('#earningsStatus');
  const fromValue = $('#earningsFrom')?.value || '';
  const toValue = $('#earningsTo')?.value || '';
  if (status) {
    status.textContent = doctorPhrase('Loading earnings...');
    status.classList.remove('error');
  }

  if (fromValue && toValue && new Date(fromValue) > new Date(toValue)) {
    if (status) {
      status.textContent = doctorPhrase('Start date cannot be later than end date.');
      status.classList.add('error');
    }
    setEarningsEmptyState(true, doctorPhrase('No earnings data found'));
    renderEarningsChart([], { hasData: false });
    renderEarningsTransactions([]);
    return;
  }

  try {
    const params = new URLSearchParams();
    if (fromValue) params.set('from', fromValue);
    if (toValue) params.set('to', toValue);
    const requestPath = `/api/doctor/earnings${params.toString() ? `?${params}` : ''}`;
    console.info('Loading doctor earnings:', {
      endpoint: requestPath,
      doctorId: App.user?._id,
      hasToken: Boolean(App.token),
      from: fromValue || null,
      to: toValue || null
    });
    const response = await fetch(`${API_BASE}${requestPath}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(App.token ? { Authorization: `Bearer ${App.token}` } : {})
      }
    });
    console.info('Doctor earnings response status:', response.status, requestPath);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.message || (
        response.status === 401
          ? 'Unauthorized. Please login again.'
          : response.status === 404
            ? 'Earnings API route not found.'
            : response.status >= 500
              ? 'Server error while loading earnings.'
              : 'Request failed.'
      );
      throw new Error(message);
    }
    const summary = data.summary || {};
    const transactions = Array.isArray(data.records)
      ? data.records
      : Array.isArray(data.transactions)
        ? data.transactions
        : [];
    console.info('Doctor earnings payload:', {
      success: data.success,
      records: transactions.length,
      summary
    });
    const chart = Array.isArray(data.chart) ? data.chart : [];
    const hasEarningsData = transactions.length > 0 || chart.some((item) => Number(item?.amount || 0) > 0);
    if ($('#earningToday')) $('#earningToday').textContent = formatDoctorINR(summary.today);
    if ($('#earningWeek')) $('#earningWeek').textContent = formatDoctorINR(summary.week);
    if ($('#earningMonth')) $('#earningMonth').textContent = formatDoctorINR(summary.month);
    if ($('#earningTotal')) $('#earningTotal').textContent = formatDoctorINR(summary.total);
    if ($('#dashboardTotalEarnings')) $('#dashboardTotalEarnings').textContent = formatDoctorINR(summary.total);
    if ($('#earningCompleted')) $('#earningCompleted').textContent = summary.completed ?? summary.completedConsultations ?? 0;
    if ($('#earningPending')) $('#earningPending').textContent = formatPendingEarnings(summary.pending ?? summary.pendingPayments, summary.pendingCount ?? summary.pendingPaymentCount);
    renderEarningsChart(chart, { hasData: hasEarningsData });
    renderEarningsTransactions(transactions);
    setEarningsEmptyState(!hasEarningsData, doctorPhrase('No earnings data found'));
    if (status) status.textContent = hasEarningsData ? doctorPhrase('Earnings updated.') : doctorPhrase('No earnings data found.');
  } catch (error) {
    console.error('Doctor earnings fetch failed:', error);
    renderEarningsChart([], { hasData: false });
    renderEarningsTransactions([]);
    setEarningsEmptyState(true, doctorPhrase('No earnings data found'));
    if (status) {
      status.textContent = doctorPhrase(error.message || 'Could not load doctor earnings.');
      status.classList.add('error');
    }
  }
}

function formatDoctorINR(value) {
  return `INR ${Number(value || 0).toLocaleString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN', {
    maximumFractionDigits: 0
  })}`;
}

function formatPendingEarnings(amount, count) {
  const pendingAmount = formatDoctorINR(amount);
  const pendingCount = Number(count || 0);
  return pendingCount > 0 ? `${pendingAmount} (${pendingCount})` : pendingAmount;
}

function setEarningsEmptyState(isEmpty, message = doctorPhrase('No earnings data found')) {
  const state = $('#earningsEmptyState');
  if (!state) return;
  state.hidden = !isEmpty;
  state.textContent = message;
}

function renderEarningsChart(chart = [], options = {}) {
  const shell = $('#earningsChart');
  if (!shell) return;
  const hasData = options.hasData ?? chart.some((item) => Number(item?.amount || 0) > 0);

  if (!hasData) {
    shell.innerHTML = `<div class="earnings-graph-empty">${escapeHtml(doctorPhrase('No earnings data found'))}</div>`;
    return;
  }

  const points = (chart.length ? chart : []).map((item, index) => ({
    label: item.label || item.date || `${index + 1}`,
    amount: Number(item.amount || 0),
    count: Number(item.count || 0)
  }));

  if (!points.length) {
    shell.innerHTML = `<div class="earnings-graph-empty">${escapeHtml(doctorPhrase('No earnings data found'))}</div>`;
    return;
  }

  const isCompactGraph = window.matchMedia?.('(max-width: 520px)').matches;
  const isTinyGraph = window.matchMedia?.('(max-width: 380px)').matches;
  const width = isCompactGraph ? 390 : 720;
  const height = isCompactGraph ? 250 : 260;
  const padding = isCompactGraph
    ? { top: 26, right: 16, bottom: 58, left: isTinyGraph ? 46 : 54 }
    : { top: 28, right: 24, bottom: 54, left: 72 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const maxAmount = Math.max(1, ...points.map((item) => item.amount));
  const xFor = (index) => padding.left + (points.length === 1 ? graphWidth / 2 : (index / (points.length - 1)) * graphWidth);
  const yFor = (amount) => padding.top + graphHeight - (amount / maxAmount) * graphHeight;
  const plotted = points.map((item, index) => ({
    ...item,
    x: xFor(index),
    y: yFor(item.amount)
  }));
  const linePath = plotted.map((item, index) => `${index === 0 ? 'M' : 'L'} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${plotted[plotted.length - 1].x.toFixed(2)} ${padding.top + graphHeight} L ${plotted[0].x.toFixed(2)} ${padding.top + graphHeight} Z`;
  const yTicks = (isTinyGraph ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((ratio) => {
    const value = Math.round(maxAmount * ratio);
    const y = yFor(value);
    return { value, y };
  });
  const visibleLabelStep = isCompactGraph && points.length > 4 ? 2 : 1;

  shell.innerHTML = `
    <div class="earnings-graph-card">
      <div class="earnings-graph-head">
        <div>
          <strong>${escapeHtml(doctorKey('doctor.lastSevenDaysEarnings', 'Last seven days earnings'))}</strong>
          <span>${escapeHtml(doctorPhrase('Paid consultations only'))}</span>
        </div>
        <b>${escapeHtml(formatDoctorINR(points.reduce((sum, item) => sum + item.amount, 0)))}</b>
      </div>
      <svg class="earnings-graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeForAttr(doctorKey('doctor.lastSevenDaysEarnings', 'Last seven days earnings'))}">
        <defs>
          <linearGradient id="earningsGraphFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0f766e" stop-opacity="0.24"></stop>
            <stop offset="100%" stop-color="#0f766e" stop-opacity="0.02"></stop>
          </linearGradient>
        </defs>
        ${yTicks.map((tick) => `
          <g class="earnings-graph-grid">
            <line x1="${padding.left}" y1="${tick.y.toFixed(2)}" x2="${width - padding.right}" y2="${tick.y.toFixed(2)}"></line>
            <text x="${padding.left - 12}" y="${(tick.y + 4).toFixed(2)}">${escapeHtml(formatCompactINR(tick.value))}</text>
          </g>
        `).join('')}
        <path class="earnings-graph-area" d="${areaPath}"></path>
        <path class="earnings-graph-line" d="${linePath}"></path>
        ${plotted.map((item) => `
          <g class="earnings-graph-point">
            <circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="6"></circle>
            <title>${escapeHtml(`${item.label}: ${formatDoctorINR(item.amount)} (${item.count})`)}</title>
          </g>
        `).join('')}
        ${plotted.map((item, index) => index % visibleLabelStep === 0 || index === plotted.length - 1 ? `
          <g class="earnings-graph-label">
            <text x="${item.x.toFixed(2)}" y="${height - 24}" text-anchor="middle">${escapeHtml(item.label)}</text>
            <text x="${item.x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatCompactINR(item.amount))}</text>
          </g>
        ` : '').join('')}
      </svg>
    </div>
  `;
}

function formatCompactINR(value) {
  const amount = Number(value || 0);
  if (amount >= 100000) return `INR ${(amount / 100000).toFixed(amount % 100000 ? 1 : 0)}L`;
  if (amount >= 1000) return `INR ${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}K`;
  return `INR ${amount.toLocaleString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN', { maximumFractionDigits: 0 })}`;
}

function renderEarningsTransactions(transactions = []) {
  const body = $('#earningsTransactionsBody');
  if (!body) return;
  body.innerHTML = transactions.length
    ? transactions.map((item) => `
      <tr>
        <td>${escapeHtml(item.patientName || doctorPhrase('Patient'))}</td>
        <td>${escapeHtml(item.consultationType || 'online')}</td>
        <td>${formatDoctorINR(item.amount)}</td>
        <td><span class="status-pill ${escapeForClass(item.paymentStatus || item.status)}">${App.tStatus(item.paymentStatus || item.status || 'paid')}</span></td>
        <td><span class="status-pill ${escapeForClass(item.appointmentStatus || item.consultationStatus)}">${App.tStatus(item.appointmentStatus || item.consultationStatus || 'confirmed')}</span></td>
        <td>${formatDateTime(item.date || item.createdAt)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="6">${escapeHtml(doctorPhrase('No earnings data found'))}</td></tr>`;
}

function normalizePatientCaseForUi(item = {}) {
  return {
    _id: item._id,
    caseId: item._id,
    requestId: item.requestId || item.intakeRequestId || '',
    intakeRequestId: item.intakeRequestId || item.requestId || '',
    patientId: item.patientId,
    appointmentId: item.appointmentId || '',
    name: item.patientName || item.name || item.patientId?.name || 'Patient',
    age: item.age || '',
    weight: item.weight || '',
    gender: item.gender || '',
    symptoms: item.symptoms || '',
    duration: item.duration || '',
    severity: item.severity || item.urgencyLevel || 'Mild',
    currentMedicines: item.currentMedicines || item.medicines || '',
    urgencyLevel: item.urgencyLevel || '',
    preferredSpecialty: item.preferredSpecialty || '',
    medicalNotes: item.medicalNotes || '',
    aiSummary: item.aiSummary || '',
    aiChatMessages: item.aiChatMessages || [],
    status: item.status === 'pending' ? 'waiting' : item.status === 'in-progress' ? 'joined' : item.status,
    joinedAt: item.startedAt || item.joinedAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function getPatientRequestDetailId(item = {}) {
  const caseId = item.caseId?._id || item.caseId || '';
  const requestId = item.requestId?._id || item.requestId || item.intakeRequestId?._id || item.intakeRequestId || '';
  return String(caseId || requestId || item._id || '').trim();
}

async function toggleDoctorAvailability() {
  const availabilityStatus = $('#availability').checked ? 'available' : 'offline';
  try {
    const profile = await App.request('/api/doctor/availability', {
      method: 'PATCH',
      body: JSON.stringify({ availabilityStatus })
    });
    $('#availabilityLabel').textContent = profile.availabilityStatus === 'available' ? doctorPhrase('Online') : doctorPhrase('Offline');
    renderAvailabilityState(profile.availability || null);
  } catch (error) {
    alert(error.message);
    $('#availability').checked = false;
    $('#availabilityLabel').textContent = doctorPhrase('Limited access');
  }
}

function renderAvailabilityState(availability = null) {
  const state = availability?.label || 'Offline';
  const className = availability?.code === 'available_now'
    ? 'online'
    : availability?.code === 'next_available'
      ? 'pending'
      : 'offline';
  if ($('#availabilityStateText')) {
    $('#availabilityStateText').textContent = doctorPhrase(state);
    $('#availabilityStateText').className = `status-pill ${className}`;
  }
}

function hydrateAvailabilitySchedule(schedule = {}) {
  const days = Array.isArray(schedule.days) && schedule.days.length
    ? schedule.days
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  document.querySelectorAll('input[name="activeDays"]').forEach((checkbox) => {
    checkbox.checked = days.includes(checkbox.value);
  });

  const slots = Array.isArray(schedule.slots) && schedule.slots.length
    ? schedule.slots
    : [{ startTime: '10:00', endTime: '13:00' }, { startTime: '17:00', endTime: '20:00' }];
  const slotsContainer = $('#availabilitySlots');
  if (!slotsContainer) return;
  slotsContainer.innerHTML = '';
  slots.forEach((slot) => addAvailabilitySlot(slot.startTime, slot.endTime));
}

function addAvailabilitySlot(startTime = '', endTime = '') {
  const slots = $('#availabilitySlots');
  if (!slots) return;
  slots.insertAdjacentHTML('beforeend', `
    <div class="availability-slot-row">
      <label class="slot-time-field"><span data-i18n="phrases.Start time">${escapeHtml(doctorPhrase('Start time'))}</span>
        <input type="time" name="slotStart" value="${escapeForAttr(startTime)}" required>
      </label>
      <label class="slot-time-field"><span data-i18n="phrases.End time">${escapeHtml(doctorPhrase('End time'))}</span>
        <input type="time" name="slotEnd" value="${escapeForAttr(endTime)}" required>
      </label>
      <button type="button" class="danger slot-remove-btn" onclick="this.parentElement.remove()">${escapeHtml(doctorPhrase('Remove'))}</button>
    </div>
  `);
  App.applyLanguage(slots.lastElementChild);
}

async function saveDoctorSchedule(event) {
  event.preventDefault();
  const status = $('#availabilitySaveStatus');
  const submitButton = event?.submitter || event?.currentTarget?.querySelector('button[type="submit"]');
  const days = [...document.querySelectorAll('input[name="activeDays"]:checked')].map((item) => item.value);
  const slots = [...document.querySelectorAll('.availability-slot-row')].map((row) => ({
    startTime: row.querySelector('input[name="slotStart"]')?.value,
    endTime: row.querySelector('input[name="slotEnd"]')?.value
  })).filter((slot) => slot.startTime && slot.endTime);

  const duplicateCheck = new Set();
  for (const slot of slots) {
    if (slot.startTime >= slot.endTime) {
      setDoctorStatus('#availabilitySaveStatus', 'Start time must be before end time.', true);
      return;
    }
    const signature = `${slot.startTime}-${slot.endTime}`;
    if (duplicateCheck.has(signature)) {
      setDoctorStatus('#availabilitySaveStatus', 'Duplicate time slots are not allowed.', true);
      return;
    }
    duplicateCheck.add(signature);
  }

  if (!slots.length) {
    setDoctorStatus('#availabilitySaveStatus', 'Add at least one active time slot.', true);
    return;
  }

  if (status) {
    status.textContent = doctorPhrase('Saving active timings...');
    status.classList.remove('error');
  }

  try {
    setActionLoading(submitButton, true, 'Saving...');
    const data = await App.request('/api/doctor/availability/schedule', {
      method: 'PATCH',
      body: JSON.stringify({ days, slots })
    });
    renderAvailabilityState(data.availability || null);
    if (status) status.textContent = doctorPhrase('Availability updated.');
  } catch (error) {
    if (status) {
      status.textContent = doctorPhrase(error.message);
      status.classList.add('error');
    }
  } finally {
    setActionLoading(submitButton, false);
  }
}

async function initDoctorPatients() {
  if (!requireDoctor()) return;
  doctorShell('patients');
  connectDoctorNotifications();
  await renderPatients('#patientsList');
}

async function renderPatients(selector, limit) {
  const list = $(selector);
  let patients = [];

  try {
    patients = await App.request('/api/doctor/patients');
  } catch (error) {
    list.innerHTML = `<article class="doctor-card verification-notice"><h3>${escapeHtml(doctorPhrase('Verification required'))}</h3><p>${escapeHtml(doctorPhrase('Your verification is pending or rejected. Access is limited.'))}</p></article>`;
    return;
  }

  const visiblePatients = limit ? patients.slice(0, limit) : patients;

  if (!visiblePatients.length) {
    list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('No patient requests yet.'))}</p>`;
    return;
  }

  list.innerHTML = visiblePatients.map((item) => {
    const initials = (item.patient.name || 'PT').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return `
    <article class="doctor-card care-list-card">
      <div class="doctor-card-header">
        <div class="avatar avatar-fallback" data-initials="${escapeForAttr(initials)}">${escapeHtml(initials)}</div>
        <div>
          <h3>${escapeHtml(item.patient.name)}</h3>
          <p class="muted">${escapeHtml(item.patient.email)}</p>
        </div>
      </div>
      <p>${escapeHtml(item.issue || doctorPhrase('General consultation'))}</p>
      <span class="status-pill ${escapeForClass(item.status)}">${escapeHtml(translatedStatus(item.status))}</span>
      <div class="actions">
        <button onclick="acceptDoctorChat('${item.patient._id}', '${escapeForAttr(item.patient.name)}')">${escapeHtml(doctorPhrase('Accept chat'))}</button>
        <button class="secondary" onclick="acceptDoctorVideo('${item.patient._id}', '${escapeForAttr(item.patient.name)}')">${escapeHtml(doctorPhrase('Accept call'))}</button>
        <button class="secondary" onclick="createPrescriptionFor('${item.patient._id}', '${escapeForAttr(item.patient.name)}', '${item.appointment?._id || ''}')">${escapeHtml(doctorPhrase('Prescription'))}</button>
      </div>
    </article>
  `;
  }).join('');
}

function acceptDoctorChat(patientId, patientName) {
  localStorage.setItem('activePatientId', patientId);
  localStorage.setItem('activePatientName', patientName);
  window.location.href = '/doctor-chat.html';
}

async function joinIntakeRequest(requestId) {
  try {
    console.info('Joining patient request:', requestId);
    const data = await App.request(`/api/doctor/request/${encodeURIComponent(requestId)}/join`, { method: 'POST' });
    const request = data.request;
    console.info('Joined patient request:', {
      requestedId: requestId,
      loadedId: request?._id,
      caseId: request?.caseId || null,
      requestId: request?.requestId || request?.intakeRequestId || null,
      hasAiSummary: Boolean(String(request?.aiSummary || '').trim())
    });
    localStorage.setItem('activePatientId', request.patientId?._id || request.patientId);
    localStorage.setItem('activePatientName', request.name || 'Patient');
    localStorage.setItem('activeAppointmentId', request.appointmentId || '');
    localStorage.setItem('activeIntakeRequestId', request.requestId || request.intakeRequestId || request._id);
    localStorage.setItem('activeIntakeSummary', JSON.stringify(request));
    window.location.href = '/doctor-chat.html';
  } catch (error) {
    alert(error.message);
  }
}

async function updateIntakeRequestStatus(requestId, action) {
  try {
    console.info('Updating patient request status:', { requestId, action });
    await App.request(`/api/doctor/request/${encodeURIComponent(requestId)}/${action}`, { method: 'POST' });
    if (window.location.pathname.endsWith('/doctor-request.html')) {
      await initDoctorRequestDetail();
    } else {
      await loadDoctorIntakeRequests();
    }
  } catch (error) {
    alert(error.message);
  }
}

function acceptDoctorVideo(patientId, patientName) {
  localStorage.setItem('activePatientId', patientId);
  localStorage.setItem('activePatientName', patientName);
  localStorage.setItem('doctorVideoRoom', App.user._id);
  localStorage.setItem('callMode', 'video');
  window.location.href = '/doctor-video.html';
}

async function startDoctorChatCall(mode) {
  const patientId = localStorage.getItem('activePatientId');
  const patientName = localStorage.getItem('activePatientName') || $('#patientName')?.textContent || 'Patient';
  if (!patientId) {
    alert('Choose a patient before starting a call.');
    return;
  }

  localStorage.setItem('doctorVideoRoom', App.user._id);
  localStorage.setItem('activePatientId', patientId);
  localStorage.setItem('activePatientName', patientName);
  localStorage.setItem('callMode', mode === 'audio' ? 'audio' : 'video');

  try {
    const data = await App.request('/api/video-call/start', {
      method: 'POST',
      body: JSON.stringify({
        patientId,
        doctorId: App.user._id,
        appointmentId: localStorage.getItem('activeAppointmentId') || null,
        callType: mode === 'audio' ? 'audio' : 'video'
      })
    });
    localStorage.setItem('activeVideoCallId', data.call?._id || '');
    $('#chatStatus').textContent = doctorPhrase('Call ringing...');
  } catch (error) {
    console.warn('Could not save call state:', error.message);
  }

  window.location.href = '/doctor-video.html';
}

function createPrescriptionFor(patientId, patientName, appointmentId = '', familyMemberId = '', familyMemberName = '') {
  localStorage.setItem('activePatientId', patientId);
  localStorage.setItem('activePatientName', patientName);
  localStorage.setItem('activeAppointmentId', appointmentId);
  if (familyMemberId) {
    localStorage.setItem('activeFamilyMemberId', familyMemberId);
    localStorage.setItem('activeFamilyMemberName', familyMemberName);
  } else {
    localStorage.removeItem('activeFamilyMemberId');
    localStorage.removeItem('activeFamilyMemberName');
  }
  window.location.href = '/doctor-prescription.html';
}

async function initDoctorChat() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('chat');
  await loadDoctorNotificationCount();

  const patientId = localStorage.getItem('activePatientId');
  const patientName = localStorage.getItem('activePatientName') || 'Patient';
  if (!patientId) {
    $('#chatStatus').textContent = doctorPhrase('Choose a patient request first.');
    return;
  }

  const room = user._id;
  $('#roomName').textContent = room;
  $('#patientName').textContent = patientName;
  ChatAttachments.init();
  ChatVoice.init({
    getContext: () => ({
      roomId: App.user._id,
      receiverId: localStorage.getItem('activePatientId'),
      appointmentId: localStorage.getItem('activeAppointmentId') || null
    }),
    canRecord: () => doctorChatStatus !== 'closed'
  });
  renderActiveIntakeSummary();
  await loadDoctorChatStatus();
  doctorSocket = App.socket();

  doctorSocket.on('connect', () => {
    doctorSocket.emit('joinRoom', { room });
    $('#chatStatus').textContent = doctorPhrase('Connected');
  });

  doctorSocket.on('receiveMessage', addDoctorMessage);
  doctorSocket.on('chatError', handleDoctorChatError);
  doctorSocket.on('chatStatusUpdated', handleDoctorChatStatusUpdate);

  const messages = await App.request(`/api/doctor/messages/${patientId}`);
  messages.forEach(addDoctorMessage);
  await App.request(`/api/messages/conversation/${room}/read`, { method: 'PATCH' });
}

function handleDoctorChatError(error = {}) {
  const status = $('#chatStatus');
  if (!status) return;
  status.textContent = error.message || 'Could not send message. Please try again.';
  status.classList.add('error');
}

async function initDoctorRequestDetail() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('patients');
  connectDoctorNotifications();
  const params = new URLSearchParams(window.location.search);
  const requestId = (params.get('id') || params.get('requestId') || params.get('caseId') || '').trim();
  const detail = $('#requestDetail');
  console.info('Doctor request detail URL id:', {
    id: params.get('id'),
    requestId: params.get('requestId'),
    caseId: params.get('caseId'),
    resolved: requestId
  });

  if (!requestId) {
    detail.innerHTML = `<p class="status-line error">${escapeHtml(doctorPhrase('Missing patient request id.'))}</p>`;
    return;
  }

  try {
    detail.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('Loading patient request...'))}</p>`;
    console.info('Fetching patient request detail:', requestId);
    const data = await App.request(`/api/doctor/request/${encodeURIComponent(requestId)}`);
    const request = data.request || data;
    console.info('Loaded patient request detail:', {
      requestedId: requestId,
      loadedId: request._id,
      caseId: request.caseId || null,
      requestId: request.requestId || request.intakeRequestId || null,
      source: data.source || request.source || null,
      hasAiSummary: Boolean(String(request.aiSummary || '').trim())
    });
    renderRequestDetail(request);
    await loadDoctorNotificationCount();
  } catch (error) {
    console.error('Unable to load patient request:', { requestId, error });
    detail.innerHTML = `<p class="status-line error">${escapeHtml(error.message || doctorPhrase('Unable to load patient request.'))}</p>`;
  }
}

async function initDoctorNotificationsPage() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('notifications');
  connectDoctorNotifications();
  await loadDoctorNotificationDropdown();
  await renderDoctorNotifications();
}

async function renderDoctorNotifications() {
  const list = $('#doctorNotificationsList');
  if (!list) return;

  try {
    const notifications = await fetchDoctorNotifications();
    const visible = filterDoctorNotifications(notifications);
    if (!visible.length) {
      list.innerHTML = `<p class="muted">${escapeHtml(doctorPhrase('No doctor notifications yet.'))}</p>`;
      return;
    }

    list.innerHTML = visible.map((item) => doctorNotificationCard(item)).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

function setDoctorNotificationFilter(filter) {
  doctorNotificationFilter = filter;
  document.querySelectorAll('[data-notification-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.notificationFilter === filter);
  });
  renderDoctorNotifications();
}

function filterDoctorNotifications(notifications) {
  const requestTypes = ['new_patient_case', 'new_patient_request', 'new_chat_request', 'chat_join_request', 'followup_request', 'emergency_alert'];
  const appointmentTypes = ['appointment_booked', 'appointment_cancelled', 'prescription_required'];
  if (doctorNotificationFilter === 'unread') return notifications.filter((item) => !item.isRead);
  if (doctorNotificationFilter === 'requests') return notifications.filter((item) => requestTypes.includes(item.type));
  if (doctorNotificationFilter === 'appointments') return notifications.filter((item) => appointmentTypes.includes(item.type));
  if (doctorNotificationFilter === 'payments') return notifications.filter((item) => item.type === 'payment_received');
  return notifications;
}

function doctorNotificationCard(item, options = {}) {
  const patient = item.relatedPatientId || item.patientId || item.relatedAppointmentId?.patient || null;
  const patientName = patient?.name || item.patientName || '';
  const symptomSummary = item.symptomSummary || item.caseId?.symptoms || '';
  const urgency = item.urgencyLevel || item.caseId?.urgencyLevel || '';
  const action = getDoctorNotificationAction(item);
  const typeLabel = doctorPhrase(String(item.type || 'notification').replace(/_/g, ' '));
  const classes = [
    'doctor-notification-card',
    item.isRead ? 'is-read' : 'is-unread',
    options.compact ? 'compact' : '',
    options.dropdown ? 'dropdown-item' : ''
  ].filter(Boolean).join(' ');

  return `
    <article class="${classes}">
      <div class="notification-card-icon">${doctorNotificationIcon(item.type)}</div>
      <div class="notification-card-main">
        <div class="notification-card-meta">
          <span class="status-pill ${escapeForClass(item.type)}">${escapeHtml(typeLabel)}</span>
          ${item.isRead ? `<span class="read-state">${escapeHtml(doctorPhrase('Read'))}</span>` : `<span class="read-state unread-dot">${escapeHtml(doctorPhrase('Unread'))}</span>`}
        </div>
        <h3>${escapeHtml(item.title ? doctorPhrase(item.title) : doctorPhrase('Doctor notification'))}</h3>
        <p>${escapeHtml(item.message ? doctorPhrase(item.message) : '')}</p>
        ${symptomSummary ? `<p class="muted"><strong>${escapeHtml(doctorPhrase('Symptoms:'))}</strong> ${escapeHtml(symptomSummary).slice(0, 90)}${symptomSummary.length > 90 ? '...' : ''}</p>` : ''}
        <div class="notification-card-foot">
          ${patientName ? `<span>${escapeHtml(patientName)}</span>` : '<span>PulseMD - Virtual Clinic</span>'}
          ${urgency ? `<span class="status-pill urgency-${escapeForClass(urgency)}">${escapeHtml(translatedStatus(urgency))}</span>` : ''}
          <span>${formatDateTime(item.createdAt)}</span>
        </div>
        <div class="doctor-notification-actions">
          ${action.href ? `<a class="button ${action.primary ? '' : 'secondary'}" href="${escapeForAttr(action.href)}" onclick="openDoctorNotificationLink(event, '${item._id}', '${escapeForAttr(action.href)}')">${escapeHtml(action.label)}</a>` : ''}
          ${action.onClick ? `<button type="button" onclick="${action.onClick}">${escapeHtml(action.label)}</button>` : ''}
          ${!item.isRead ? `<button type="button" class="secondary" onclick="markDoctorNotificationRead('${item._id}')">${escapeHtml(doctorPhrase('Mark as Read'))}</button>` : ''}
          <button type="button" class="danger" onclick="deleteDoctorNotification('${item._id}')">${escapeHtml(doctorPhrase('Delete'))}</button>
        </div>
      </div>
    </article>
  `;
}

function doctorNotificationIcon(type) {
  if (String(type || '').includes('appointment')) {
    return '<span class="nav-svg emoji-icon" aria-hidden="true">\u{1F4E9}</span>';
  }
  const iconMap = {
    new_patient_request: 'patients',
    new_patient_case: 'patients',
    new_chat_request: 'chat',
    appointment_booked: 'appointments',
    appointment_cancelled: 'appointments',
    payment_received: 'payments',
    followup_request: 'video',
    prescription_required: 'prescriptions',
    chat_join_request: 'chat',
    emergency_alert: 'emergency'
  };
  return App.medIcon(iconMap[type] || 'notifications');
}

function getDoctorNotificationAction(item) {
  const caseId = getEntityId(item.caseId) || item.relatedChatId || '';
  const requestId = getEntityId(item.relatedRequestId) || getEntityId(item.requestId) || '';
  const patient = item.relatedPatientId || item.patientId || item.relatedAppointmentId?.patient || {};
  const patientId = patient?._id || item.relatedPatientId || item.patientId || '';
  const patientName = patient?.name || 'Patient';

  if ((item.type === 'new_patient_request' || item.type === 'new_patient_case') && (requestId || caseId)) {
    const detailId = caseId || requestId;
    console.info('Notification patient request link:', {
      notificationId: item._id,
      detailId,
      caseId,
      requestId
    });
    return { label: doctorPhrase('View Details'), href: `/doctor-request.html?id=${encodeURIComponent(detailId)}`, primary: true };
  }

  if (item.type === 'emergency_alert') {
    return { label: doctorPhrase('View Emergency'), href: '/doctor-dashboard.html#activeEmergencySection', primary: true };
  }

  if (item.type === 'new_chat_request' || item.type === 'chat_join_request' || item.type === 'followup_request') {
    return {
      label: item.type === 'followup_request' ? doctorPhrase('Open Follow-up') : doctorPhrase('Join Chat'),
      onClick: `openDoctorNotificationChat('${item._id}', '${escapeForAttr(patientId)}', '${escapeForAttr(patientName)}')`
    };
  }

  if (item.type === 'appointment_booked') {
    return { label: doctorPhrase('Accept Appointment'), href: '/doctor-appointments.html', primary: true };
  }

  if (item.type === 'appointment_cancelled') {
    return { label: doctorPhrase('View Appointment'), href: '/doctor-appointments.html' };
  }

  if (item.type === 'payment_received') {
    return { label: doctorPhrase('View Payment'), href: '/doctor-payments.html', primary: true };
  }

  if (item.type === 'prescription_required') {
    return { label: doctorPhrase('Create Prescription'), href: '/doctor-prescription.html', primary: true };
  }

  return { label: doctorPhrase('View Details'), href: '/doctor-dashboard.html' };
}

function getEntityId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return '';
}

async function openDoctorNotificationChat(notificationId, patientId, patientName) {
  if (notificationId) await markDoctorNotificationRead(notificationId, { silent: true });
  if (patientId) localStorage.setItem('activePatientId', patientId);
  if (patientName) localStorage.setItem('activePatientName', patientName);
  window.location.href = '/doctor-chat.html';
}

async function openDoctorNotificationLink(event, notificationId, href) {
  event?.preventDefault();
  if (notificationId) await markDoctorNotificationRead(notificationId, { silent: true });
  window.location.href = href;
}

async function markDoctorNotificationRead(id, options = {}) {
  try {
    await App.request(`/api/doctor/notifications/${id}/read`, { method: 'POST' });
    await refreshDoctorNotificationSurfaces();
  } catch (error) {
    if (!options.silent) alert(error.message);
  }
}

async function markDoctorNotificationsRead() {
  try {
    await App.request('/api/doctor/notifications/read-all', { method: 'POST' });
    localStorage.setItem('doctorUnread', '0');
    updateDoctorNotificationBadges(0);
    await refreshDoctorNotificationSurfaces();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteDoctorNotification(id) {
  try {
    await App.request(`/api/doctor/notifications/${id}`, { method: 'DELETE' });
    await refreshDoctorNotificationSurfaces();
  } catch (error) {
    alert(error.message);
  }
}

async function refreshDoctorNotificationSurfaces() {
  await loadDoctorNotificationCount();
  if ($('#doctorNotificationsList')) await renderDoctorNotifications();
  if ($('#doctorDashboardNotifications')) await loadDoctorDashboardNotifications();
  if ($('#doctorNotificationDropdownList')) await loadDoctorNotificationDropdown();
}

async function toggleDoctorNotificationDropdown(event) {
  event?.stopPropagation();
  const dropdown = $('#doctorNotificationDropdown');
  const button = document.querySelector('.notification-icon-button');
  if (!dropdown) return;

  const willOpen = dropdown.hidden;
  dropdown.hidden = !willOpen;
  dropdown.classList.toggle('is-open', willOpen);
  if (button) button.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) await loadDoctorNotificationDropdown();
}

document.addEventListener('click', (event) => {
  const dropdown = $('#doctorNotificationDropdown');
  if (!dropdown || dropdown.hidden) return;
  if (event.target.closest('.notification-bell-wrap, .doctor-global-notification')) return;
  dropdown.hidden = true;
  dropdown.classList.remove('is-open');
  document.querySelector('.notification-icon-button')?.setAttribute('aria-expanded', 'false');
});

function getAiSummaryText(request = {}) {
  const summary = String(request.aiSummary || request.requestId?.aiSummary || '').trim();
  return summary || 'AI summary not available';
}

function renderRequestDetail(request) {
  const detail = $('#requestDetail');
  const canJoin = ['waiting', 'later'].includes(request.status);
  const joinedText = request.joinedAt ? `<p><strong>Doctor joined:</strong> ${formatDateTime(request.joinedAt)}</p>` : '';
  const detailId = getPatientRequestDetailId(request);
  const aiSummary = getAiSummaryText(request);
  console.info('Rendering patient request AI summary:', {
    requestId: detailId,
    hasAiSummary: aiSummary !== 'AI summary not available'
  });
  detail.innerHTML = `
    <div class="request-detail-head">
      <div>
        <span class="status-pill ${request.status}">${escapeHtml(request.status)}</span>
        <h2>${escapeHtml(request.name)}</h2>
        <p class="muted">Request time: ${formatDateTime(request.createdAt)}</p>
      </div>
      <span class="status-pill severity-${escapeForClass(request.severity)}">${escapeHtml(request.severity)}</span>
    </div>

    <div class="request-detail-grid">
      <article>
        <h3>Patient Information</h3>
        <p><strong>Name:</strong> ${escapeHtml(request.name)}</p>
        <p><strong>Age:</strong> ${escapeHtml(request.age)}</p>
        <p><strong>Weight:</strong> ${escapeHtml(request.weight || '-')}</p>
        <p><strong>Gender:</strong> ${escapeHtml(request.gender)}</p>
      </article>
      <article>
        <h3>Health Details</h3>
        <p><strong>Symptoms:</strong> ${escapeHtml(request.symptoms)}</p>
        <p><strong>Duration:</strong> ${escapeHtml(request.duration)}</p>
        <p><strong>Severity:</strong> ${escapeHtml(request.severity)}</p>
        <p><strong>Medicines:</strong> ${escapeHtml(request.currentMedicines || request.medicines || '-')}</p>
      </article>
    </div>

    <article class="ai-summary-box">
      <h3>AI Intake Summary</h3>
      <p>${escapeHtml(aiSummary)}</p>
    </article>

    <article class="ai-summary-box">
      <h3>AI Chat Record</h3>
      ${renderAiChatHistory(request.aiChatMessages || [])}
    </article>

    <article class="ai-summary-box request-status-box">
      <h3>Status Information</h3>
      <p><strong>Status:</strong> ${escapeHtml(request.status)}</p>
      <p><strong>Created:</strong> ${formatDateTime(request.createdAt)}</p>
      <p><strong>Last updated:</strong> ${formatDateTime(request.updatedAt)}</p>
      ${joinedText}
    </article>

    <div class="actions">
      ${canJoin ? `<button type="button" onclick="joinIntakeRequest('${escapeForAttr(detailId)}')">Join Chat</button>` : `<button type="button" disabled>Join Chat</button>`}
      ${request.status !== 'declined' ? `<button type="button" class="danger" onclick="updateIntakeRequestStatus('${escapeForAttr(detailId)}', 'decline')">Decline Request</button>` : ''}
      ${request.status !== 'later' && request.status !== 'joined' ? `<button type="button" class="secondary" onclick="updateIntakeRequestStatus('${escapeForAttr(detailId)}', 'later')">Mark for Later</button>` : ''}
      <a class="button secondary" href="/doctor-notifications.html">Back to Notifications</a>
    </div>
  `;
}

function renderAiChatHistory(messages = []) {
  if (!Array.isArray(messages) || !messages.length) {
    return '<p class="muted">No AI chat transcript was saved for this request.</p>';
  }

  return `
    <div class="ai-chat-history">
      ${messages.map((message) => `
        <div class="ai-chat-history-row ${escapeForClass(message.sender || 'system')}">
          <strong>${escapeHtml(message.sender === 'patient' ? 'Patient' : message.sender === 'bot' ? 'PulseMD - Virtual Clinic AI' : 'System')}</strong>
          <p>${escapeHtml(message.text || '')}</p>
          <small>${formatDateTime(message.createdAt)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderActiveIntakeSummary() {
  const raw = localStorage.getItem('activeIntakeSummary');
  if (!raw) return;
  let request;
  try {
    request = JSON.parse(raw);
  } catch (error) {
    return;
  }

  const shell = document.querySelector('.chat-shell');
  const messages = $('#messages');
  if (!shell || !messages || document.querySelector('.chat-intake-summary-card')) return;

  const aiSummary = getAiSummaryText(request);
  console.info('Rendering doctor chat AI summary:', {
    requestId: request.requestId || request.intakeRequestId || request._id || '',
    patientId: request.patientId?._id || request.patientId || localStorage.getItem('activePatientId') || '',
    doctorId: App.user?._id || '',
    hasAiSummary: aiSummary !== 'AI summary not available'
  });
  const card = document.createElement('article');
  card.className = 'chat-intake-summary-card';
  card.innerHTML = `
    <div>
      <span class="status-pill severity-${escapeForClass(request.severity)}">${escapeHtml(request.severity)}</span>
      <h2>AI Intake Summary</h2>
      <p class="muted">Doctor joined at ${formatDateTime(request.joinedAt || new Date())}</p>
    </div>
    <p id="intakeAiSummaryText">${escapeHtml(aiSummary)}</p>
    <div class="request-detail-grid">
      <p><strong>Name:</strong> ${escapeHtml(request.name)}</p>
      <p><strong>Age:</strong> ${escapeHtml(request.age)}</p>
      <p><strong>Weight:</strong> ${escapeHtml(request.weight || '-')}</p>
      <p><strong>Gender:</strong> ${escapeHtml(request.gender)}</p>
      <p><strong>Symptoms:</strong> ${escapeHtml(request.symptoms)}</p>
      <p><strong>Duration:</strong> ${escapeHtml(request.duration)}</p>
      <p><strong>Severity:</strong> ${escapeHtml(request.severity)}</p>
      <p><strong>Medicines:</strong> ${escapeHtml(request.currentMedicines || request.medicines || '-')}</p>
      <p><strong>Prescription:</strong> <span id="intakePrescriptionStatus">Pending</span></p>
      <p><strong>Chat status:</strong> <span id="intakeChatStatus">${escapeHtml(formatChatStatusLabel(doctorChatStatus))}</span></p>
    </div>
  `;
  shell.insertBefore(card, messages);
}

function sendDoctorMessage(event) {
  event.preventDefault();
  if (doctorChatStatus === 'closed') {
    alert('This consultation chat is closed. Reopen it before sending a message.');
    return;
  }
  const message = $('#messageInput').value.trim();
  const receiverId = localStorage.getItem('activePatientId');
  if ((!message && !ChatAttachments.getSelectedFile()) || !receiverId) return;
  if (ChatVoice.hasPreview()) {
    alert('Send or delete the voice preview before sending text.');
    return;
  }

  if (ChatAttachments.getSelectedFile()) {
    ChatAttachments.send({
      roomId: App.user._id,
      receiverId,
      appointmentId: localStorage.getItem('activeAppointmentId') || null,
      caption: message
    });
    $('#messageInput').value = '';
    return;
  }

  doctorSocket.emit('sendMessage', {
    room: App.user._id,
    receiverId,
    appointmentId: localStorage.getItem('activeAppointmentId') || null,
    message
  });
  $('#messageInput').value = '';
}

function addDoctorMessage(message) {
  const senderId = message.sender?._id || message.sender;
  const isMine = senderId === App.user._id;
  const node = document.createElement('div');
  const isSystem = message.type === 'system';
  node.className = `message ${isMine ? 'mine' : ''} ${isSystem ? 'system-message' : ''}`;
  node.innerHTML = `
    <small><span>${isSystem ? 'PulseMD - Virtual Clinic' : isMine ? 'You' : message.sender?.name || 'Patient'}</span><span>${formatDateTime(message.createdAt)}</span></small>
    ${message.messageType === 'audio' ? ChatVoice.renderMessageContent(message) : message.fileUrl ? ChatAttachments.renderMessageContent(message) : `<div>${escapeHtml(message.text)}</div>`}
  `;
  $('#messages').appendChild(node);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

async function loadDoctorChatStatus() {
  const patientId = localStorage.getItem('activePatientId');
  if (!patientId || !App.user?._id) return;

  try {
    const data = await App.request(`/api/chat/${App.user._id}/status?patientId=${encodeURIComponent(patientId)}`);
    applyDoctorChatStatus(data.chat || data);
  } catch (error) {
    applyDoctorChatStatus({ status: 'open' });
  }
}

function applyDoctorChatStatus(chat = {}) {
  doctorChatStatus = chat.status || 'open';
  const chatAiSummary = String(chat.aiSummary || chat.requestId?.aiSummary || '').trim();
  const badge = $('#consultationStatusBadge');
  const banner = $('#doctorChatBanner');
  const input = $('#messageInput');
  const sendButton = document.querySelector('.chat-form button[type="submit"]');
  const attachButton = $('#chatAttachmentBtn');
  const voiceButton = $('#voiceRecordBtn');
  const closeBtn = $('#closeChatBtn');
  const reopenBtn = $('#reopenChatBtn');

  if (badge) {
    badge.textContent = formatChatStatusLabel(doctorChatStatus);
    badge.className = `status-pill chat-${escapeForClass(doctorChatStatus)}`;
  }

  if ($('#intakeChatStatus')) $('#intakeChatStatus').textContent = formatChatStatusLabel(doctorChatStatus);
  if (chatAiSummary && $('#intakeAiSummaryText')) {
    $('#intakeAiSummaryText').textContent = chatAiSummary;
    try {
      const current = JSON.parse(localStorage.getItem('activeIntakeSummary') || '{}');
      current.aiSummary = chatAiSummary;
      localStorage.setItem('activeIntakeSummary', JSON.stringify(current));
    } catch (error) {
      console.warn('Could not update local AI summary:', error.message);
    }
  }
  if ($('#intakePrescriptionStatus')) {
    $('#intakePrescriptionStatus').textContent = chat.prescriptionId || doctorChatStatus === 'prescription_sent'
      ? 'Shared'
      : 'Pending';
  }

  const isClosed = doctorChatStatus === 'closed';
  if (input) input.disabled = isClosed;
  if (sendButton) sendButton.disabled = isClosed;
  if (attachButton) attachButton.disabled = isClosed;
  if (voiceButton) voiceButton.disabled = isClosed;
  if (closeBtn) closeBtn.hidden = isClosed;
  if (reopenBtn) reopenBtn.hidden = !isClosed;

  if (banner) {
    banner.hidden = !isClosed;
    banner.innerHTML = isClosed
      ? '<strong>Chat closed.</strong><span>This consultation is read-only until you reopen it.</span>'
      : '';
  }
}

function handleDoctorChatStatusUpdate(update = {}) {
  applyDoctorChatStatus(update);
}

function formatChatStatusLabel(status = 'open') {
  return String(status || 'open').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function goToDoctorPrescription() {
  const patientId = localStorage.getItem('activePatientId');
  const patientName = localStorage.getItem('activePatientName') || 'Patient';
  const appointmentId = localStorage.getItem('activeAppointmentId') || '';
  if (patientId) createPrescriptionFor(patientId, patientName, appointmentId);
}

async function closeConsultationChat() {
  if (!window.confirm('Close this consultation chat? The patient will not be able to send messages until you reopen it.')) return;
  await updateDoctorChatLifecycle('close');
}

async function reopenConsultationChat() {
  await updateDoctorChatLifecycle('reopen');
}

async function updateDoctorChatLifecycle(action) {
  const patientId = localStorage.getItem('activePatientId');
  if (!patientId) return alert('Choose a patient first.');

  try {
    const data = await App.request(`/api/chat/${App.user._id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        patientId,
        appointmentId: localStorage.getItem('activeAppointmentId') || null,
        requestId: localStorage.getItem('activeIntakeRequestId') || null
      })
    });
    applyDoctorChatStatus(data.chat);
  } catch (error) {
    alert(error.message);
  }
}

async function initDoctorAppointments() {
  if (!requireDoctor()) return;
  doctorShell('appointments');
  connectDoctorNotifications();
  await loadDoctorAppointments();
}

async function loadDoctorAppointments() {
  const body = $('#appointmentsBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="7">${escapeHtml(doctorPhrase('Loading appointments...'))}</td></tr>`;

  let appointments = [];
  try {
    appointments = await App.request('/api/doctor/appointments');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7" class="status-line error">${escapeHtml(doctorPhrase(error.message || 'Server error'))}</td></tr>`;
    return;
  }

  if (!appointments.length) {
    body.innerHTML = `<tr><td colspan="7">${escapeHtml(doctorPhrase('No appointments booked yet.'))}</td></tr>`;
    return;
  }

  body.innerHTML = appointments.map((item) => `
    <tr>
      <td>${escapeHtml(item.patient?.name || doctorPhrase('Patient'))}${item.familyMemberId ? `<br><small class="muted">For ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</small>` : ''}</td>
      <td>${new Date(item.scheduledAt).toLocaleString()}</td>
      <td>${escapeHtml(item.reason || doctorPhrase('General consultation'))}</td>
      <td>${formatMoney(item.consultationFee)}</td>
      <td><span class="status-pill ${escapeForClass(item.paymentStatus)}">${escapeHtml(translatedStatus(item.paymentStatus || 'pending'))}</span></td>
      <td><span class="status-pill ${escapeForClass(item.status)}">${escapeHtml(translatedStatus(item.status || 'pending'))}</span></td>
      <td class="actions">
        <button onclick="updateAppointment('${item._id}', 'confirmed', event)" ${item.status === 'confirmed' ? 'disabled' : ''}>${escapeHtml(doctorPhrase('Accept Appointment'))}</button>
        <button class="secondary" onclick="updateAppointment('${item._id}', 'completed', event)" ${item.status === 'completed' ? 'disabled' : ''}>${escapeHtml(doctorPhrase('Complete'))}</button>
        <button class="secondary" onclick="createPrescriptionFor('${item.patient?._id || item.patient}', '${escapeForAttr(item.patient?.name || doctorPhrase('Patient'))}', '${item._id}', '${escapeForAttr(item.familyMemberId?._id || '')}', '${escapeForAttr(item.familyMemberId?.fullName || '')}')">💊</button>
        <button class="danger" onclick="deleteAppointment('${item._id}', event)">${escapeHtml(doctorPhrase('Delete'))}</button>
      </td>
    </tr>
  `).join('');
}

async function updateAppointment(id, status, event) {
  const button = event?.currentTarget;
  try {
    setActionLoading(button, true, 'Updating...');
    await App.request(`/api/doctor/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    setDoctorStatus('#appointmentsStatus', 'Appointment updated.');
    await loadDoctorAppointments();
  } catch (error) {
    alert(error.message);
  } finally {
    setActionLoading(button, false);
  }
}

async function deleteAppointment(id, event) {
  const button = event?.currentTarget;
  if (!window.confirm(doctorPhrase('Delete this appointment?'))) return;
  try {
    setActionLoading(button, true, 'Deleting...');
    await App.request(`/api/appointments/${id}`, { method: 'DELETE' });
    setDoctorStatus('#appointmentsStatus', 'Appointment deleted.');
    await loadDoctorAppointments();
  } catch (error) {
    alert(error.message);
  } finally {
    setActionLoading(button, false);
  }
}

function initDoctorVideoPage() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('video');
  const callMode = localStorage.getItem('callMode') === 'audio' ? 'audio' : 'video';
  $('#roomName').textContent = localStorage.getItem('doctorVideoRoom') || user._id;
  $('#patientName').textContent = localStorage.getItem('activePatientName') || 'Patient';
  document.body.classList.toggle('audio-call', callMode === 'audio');
  $('#cameraBtn').hidden = callMode === 'audio';
  const pageTitle = document.querySelector('.page-head h1');
  if (pageTitle) pageTitle.textContent = callMode === 'audio' ? 'Audio call' : 'Video call';
}

async function acceptDoctorCall() {
  const room = localStorage.getItem('doctorVideoRoom') || App.user._id;
  const callMode = localStorage.getItem('callMode') === 'audio' ? 'audio' : 'video';
  $('#videoStatus').textContent = callMode === 'audio' ? 'Opening microphone...' : 'Opening camera...';

  try {
    doctorStream = await navigator.mediaDevices.getUserMedia({ video: callMode === 'video', audio: true });
    $('#localVideo').srcObject = doctorStream;
  } catch (error) {
    $('#videoStatus').textContent = `Call permission error: ${error.message}`;
    $('#videoStatus').classList.add('error');
    return;
  }

  doctorSocket = App.socket();
  doctorPeer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  doctorStream.getTracks().forEach((track) => doctorPeer.addTrack(track, doctorStream));

  doctorPeer.ontrack = (event) => {
    $('#remoteVideo').srcObject = event.streams[0];
    $('#videoStatus').textContent = 'Connected';
    updateActiveVideoCall('connected');
  };

  doctorPeer.onicecandidate = (event) => {
    if (event.candidate) doctorSocket.emit('ice-candidate', { room, candidate: event.candidate });
  };

  doctorSocket.on('connect', () => {
    doctorSocket.emit('join-video', { roomId: room });
    $('#videoStatus').textContent = 'Waiting for patient...';
  });

  doctorSocket.on('offer', async ({ offer }) => {
    await doctorPeer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await doctorPeer.createAnswer();
    await doctorPeer.setLocalDescription(answer);
    doctorSocket.emit('answer', { room, answer });
  });

  doctorSocket.on('answer', async ({ answer }) => {
    await doctorPeer.setRemoteDescription(new RTCSessionDescription(answer));
  });

  doctorSocket.on('ice-candidate', async ({ candidate }) => {
    if (candidate) await doctorPeer.addIceCandidate(new RTCIceCandidate(candidate));
  });

  $('#acceptCallBtn').disabled = true;
}

function toggleDoctorCamera() {
  const track = doctorStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('#cameraBtn').textContent = track.enabled ? 'Camera OFF' : 'Camera ON';
}

function toggleDoctorMute() {
  const track = doctorStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('#muteBtn').textContent = track.enabled ? 'Mute' : 'Unmute';
}

function endDoctorCall() {
  doctorStream?.getTracks().forEach((track) => track.stop());
  doctorPeer?.close();
  doctorSocket?.disconnect();
  updateActiveVideoCall('ended');
  window.location.href = '/doctor-dashboard.html';
}

async function updateActiveVideoCall(status) {
  const callId = localStorage.getItem('activeVideoCallId');
  if (!callId) return;
  try {
    if (status === 'ended' || status === 'missed') {
      await App.request('/api/video-call/end', {
        method: 'POST',
        body: JSON.stringify({ callId, status })
      });
      localStorage.removeItem('activeVideoCallId');
    }
  } catch (error) {
    console.warn('Could not update video call status:', error.message);
  }
}

async function initDoctorPayments() {
  if (!requireDoctor()) return;
  doctorShell('payments');
  const payments = await App.request('/api/doctor/payments');
  const body = $('#paymentsBody');
  body.innerHTML = payments.length
    ? payments.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.patientId?.name || 'Patient')}</td>
        <td>${formatMoney(payment.amount)}</td>
        <td><span class="status-pill ${payment.paymentStatus}">${payment.paymentStatus}</span></td>
        <td>${formatDateTime(payment.paymentDate)}</td>
        <td>${escapeHtml(payment.paymentId)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="5">No payments yet.</td></tr>';
}

async function initDoctorPrescriptionPage() {
  if (!requireDoctor()) return;
  doctorShell('prescriptions');
  $('#patientId').value = localStorage.getItem('activePatientId') || '';
  $('#appointmentId').value = localStorage.getItem('activeAppointmentId') || '';
  $('#patientName').textContent = localStorage.getItem('activePatientName') || 'Choose a patient from Patients or Appointments';
  await loadDoctorPrescriptions();
}

function addMedicineRow() {
  $('#medicineRows').insertAdjacentHTML('beforeend', `
    <div class="medicine-row">
      <input name="name" placeholder="Medicine" required>
      <input name="dosage" placeholder="Dosage" required>
      <input name="timing" placeholder="Timing" required>
      <input name="duration" placeholder="Duration">
      <button type="button" class="danger" onclick="this.parentElement.remove()">Remove</button>
    </div>
  `);
}

async function submitPrescription(event) {
  event.preventDefault();
  const rows = [...document.querySelectorAll('.medicine-row')];
  const medicines = rows.map((row) => ({
    name: row.querySelector('[name="name"]').value,
    dosage: row.querySelector('[name="dosage"]').value,
    timing: row.querySelector('[name="timing"]').value,
    duration: row.querySelector('[name="duration"]').value
  }));

  try {
    await App.request('/api/doctor/prescriptions', {
      method: 'POST',
      body: JSON.stringify({
        patientId: $('#patientId').value,
        appointmentId: $('#appointmentId').value || null,
        familyMemberId: localStorage.getItem('activeFamilyMemberId') || null,
        medicines,
        notes: $('#notes').value,
        advice: $('#advice').value
      })
    });
  } catch (error) {
    $('#prescriptionStatus').textContent = error.message;
    $('#prescriptionStatus').classList.add('error');
    return;
  }

  $('#prescriptionStatus').textContent = 'Prescription sent to patient.';
  $('#prescriptionStatus').classList.remove('error');
  event.currentTarget.reset();
  $('#medicineRows').innerHTML = '';
  addMedicineRow();
  await loadDoctorPrescriptions();
}

async function loadDoctorPrescriptions() {
  const prescriptions = await App.request('/api/doctor/prescriptions');
  $('#sentPrescriptions').innerHTML = prescriptions.length
    ? prescriptions.slice(0, 6).map((item) => `
      <article class="doctor-card">
        <h3>${escapeHtml(item.patient?.name || 'Patient')}</h3>
        ${item.familyMemberId ? `<p class="muted">For ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</p>` : ''}
        <p class="muted">${formatDateTime(item.prescriptionDate)}</p>
        <p>${item.medicines.length} medicine(s)</p>
      </article>
    `).join('')
    : '<p class="muted">No prescriptions sent yet.</p>';
}

async function initDoctorProfile() {
  const user = requireDoctor();
  if (!user) return;
  doctorShell('profile');
  const data = await App.request('/api/doctor/dashboard');
  $('#profileName').textContent = `Dr. ${data.profile?.user?.name || user.name}`;
  $('#profileSpecialty').textContent = data.profile?.specialization || 'General Medicine';
  $('#profileEmail').textContent = data.profile?.user?.email || user.email;
  $('#profileFee').textContent = formatMoney(data.profile?.fee || 0);
  if ($('#upiId')) $('#upiId').value = data.profile?.paymentSettings?.upiId || '';
  if ($('#bankAccountHolderName')) $('#bankAccountHolderName').value = data.profile?.paymentSettings?.bankAccountHolderName || '';
  if ($('#bankAccountNumber')) $('#bankAccountNumber').value = data.profile?.paymentSettings?.bankAccountNumber || '';
  if ($('#ifscCode')) $('#ifscCode').value = data.profile?.paymentSettings?.ifscCode || '';
  if ($('#paymentQrCode')) $('#paymentQrCode').value = data.profile?.paymentSettings?.paymentQrCode || '';
  if ($('#profileVerification')) {
    const verification = getVerificationDisplay(data.profile);
    $('#profileVerification').textContent = verification.label;
    $('#profileVerification').className = `status-pill ${verification.className}`;
  }
}

async function saveDoctorPaymentSettings(event) {
  event.preventDefault();
  const status = $('#paymentSettingsStatus');
  if (status) {
    status.textContent = 'Saving payment settings...';
    status.classList.remove('error');
  }

  try {
    await App.request('/api/doctor/payment-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        upiId: $('#upiId')?.value || '',
        bankAccountHolderName: $('#bankAccountHolderName')?.value || '',
        bankAccountNumber: $('#bankAccountNumber')?.value || '',
        ifscCode: $('#ifscCode')?.value || '',
        paymentQrCode: $('#paymentQrCode')?.value || ''
      })
    });
    if (status) status.textContent = 'Payment settings updated.';
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.classList.add('error');
    }
  }
}

function renderDoctorVerification(profile) {
  const verification = getVerificationDisplay(profile);
  const badge = $('#verificationBadge');
  const notice = $('#verificationNotice');
  const summary = $('#doctorVerificationSummary');
  const demoButton = $('#demoVerifyBtn');
  const status = $('#verificationActionStatus');

  if (badge) {
    badge.textContent = verification.label;
    badge.className = `status-pill ${verification.className}`;
  }

  if (summary) summary.textContent = verification.label;

  if (notice) {
    notice.hidden = verification.isVerified;
    const message = profile?.verificationMessage || 'Your verification is pending or rejected. Access is limited.';
    const noticeText = notice.querySelector('p');
    if (noticeText) noticeText.textContent = verification.isVerified ? '' : doctorPhrase(message);
  }
  if (demoButton) {
    demoButton.hidden = verification.isVerified;
    demoButton.disabled = false;
    demoButton.textContent = doctorKey('doctor.demoVerify', 'Verify for demo');
  }
  if (status && verification.isVerified) status.textContent = doctorPhrase('Verified Badge');
  if ($('#availability')) $('#availability').disabled = !verification.isVerified;
}

function getVerificationDisplay(profile = {}) {
  if (profile.isVerified || profile.verificationStatus === 'verified' || profile.verificationStatus === 'Verified') {
    return {
      isVerified: true,
      label: doctorPhrase('Verified Badge'),
      className: 'verified'
    };
  }

  if (profile.verificationStatus === 'rejected') {
    return {
      isVerified: false,
      label: doctorPhrase('Rejected'),
      className: 'rejected'
    };
  }

  return {
    isVerified: false,
    label: doctorPhrase('Pending Review'),
    className: 'pending'
  };
}

async function toggleDemoVerification(verified = true) {
  const button = $('#demoVerifyBtn');
  const status = $('#verificationActionStatus');
  try {
    setActionLoading(button, true, 'Updating...');
    if (status) {
      status.textContent = doctorPhrase('Updating verification...');
      status.classList.remove('error');
    }
    const data = await App.request('/api/doctor/verification/demo', {
      method: 'PATCH',
      body: JSON.stringify({ verified })
    });
    renderDoctorVerification(data.profile);
    if (status) status.textContent = verified ? doctorPhrase('Doctor verified for demo.') : doctorPhrase('Verification set to pending review.');
    await loadDoctorIntakeRequests();
    await renderPatients('#incomingPatients', 3);
  } catch (error) {
    if (status) {
      status.textContent = doctorPhrase(error.message);
      status.classList.add('error');
    } else {
      alert(error.message);
    }
  } finally {
    setActionLoading(button, false);
  }
}

function escapeForAttr(value) {
  return String(value || '').replace(/'/g, '&#039;').replace(/"/g, '&quot;');
}

function escapeForClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

