let patientNotificationFilter = 'all';

async function initNotifications() {
  App.mountPatientNav('notifications');
  const user = App.requireAuth();
  if (!user) return;
  await App.initI18n();
  App.connectPatientNotifications();
  await renderPatientNotifications();
}

async function fetchPatientNotifications() {
  const user = App.user;
  const data = await App.request(`/api/patient/notifications/${user._id}`);
  localStorage.setItem('patientUnread', String(data.unreadCount || 0));
  App.updatePatientNotificationBadges(data.unreadCount || 0);
  return data.notifications || [];
}

async function renderPatientNotifications() {
  const list = document.querySelector('#notificationsList');
  if (!list) return;

  try {
    const notifications = await fetchPatientNotifications();
    const visible = filterPatientNotifications(notifications);
    if (!visible.length) {
      list.innerHTML = `<article class="notification-card"><h2>${App.t('empty.noNotifications')}</h2><p class="muted">${App.t('notifications.emptyText')}</p></article>`;
      return;
    }

    list.innerHTML = visible.map(patientNotificationCard).join('');
  } catch (error) {
    console.error('Could not render patient notifications:', error);
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

function setPatientNotificationFilter(filter) {
  patientNotificationFilter = filter;
  document.querySelectorAll('[data-patient-notification-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.patientNotificationFilter === filter);
  });
  renderPatientNotifications();
}

function filterPatientNotifications(notifications) {
  const appointmentTypes = ['appointment_approved', 'appointment_rejected', 'appointment_status'];
  const chatTypes = ['doctor_accepted_case', 'doctor_sent_message', 'doctor_joined_consultation', 'consultation_closed', 'consultation_reopened', 'request_declined', 'request_later'];
  const prescriptionTypes = ['prescription_uploaded'];
  if (patientNotificationFilter === 'unread') return notifications.filter((item) => !item.isRead);
  if (patientNotificationFilter === 'appointments') return notifications.filter((item) => appointmentTypes.includes(item.type));
  if (patientNotificationFilter === 'chat') return notifications.filter((item) => chatTypes.includes(item.type));
  if (patientNotificationFilter === 'prescriptions') return notifications.filter((item) => prescriptionTypes.includes(item.type));
  return notifications;
}

function patientNotificationCard(item) {
  const typeLabel = App.t(`notificationTypes.${item.type || 'notification'}`);
  const action = getPatientNotificationAction(item);
  return `
    <article class="notification-card ${item.isRead ? '' : 'unread'}" data-notification>
      <div class="notification-card-meta">
        <span class="status-pill ${escapeForClass(item.type)}">${escapeHtml(typeLabel)}</span>
        ${item.isRead ? `<span class="read-state">${App.t('status.read')}</span>` : `<span class="read-state unread-dot">${App.t('status.unread')}</span>`}
      </div>
      <h2>${escapeHtml(translateNotificationTitle(item))}</h2>
      <p class="muted">${escapeHtml(translateNotificationMessage(item))}</p>
      <div class="notification-card-foot">
        <span>${formatDateTime(item.createdAt)}</span>
      </div>
      <div class="doctor-notification-actions">
        <a class="button" href="${escapeForAttr(action.href)}" onclick="openPatientNotification(event, '${item._id}', '${escapeForAttr(action.href)}')">${escapeHtml(action.label)}</a>
        ${!item.isRead ? `<button type="button" class="secondary" onclick="markPatientNotificationRead('${item._id}')">${App.t('buttons.markRead')}</button>` : ''}
      </div>
    </article>
  `;
}

function translateNotificationTitle(item = {}) {
  return App.t(`notificationTitles.${item.type}`) || App.translatePhrase(item.title || 'PulseMD - Virtual Clinic update');
}

function translateNotificationMessage(item = {}) {
  if (item.type === 'emergency_update') return App.t('notificationMessages.emergencyUpdate');
  if (item.type === 'prescription_uploaded') return App.t('notificationMessages.prescriptionUploaded');
  if (String(item.type || '').startsWith('appointment_')) return App.t('notificationMessages.appointmentUpdate');
  if (String(item.type || '').includes('chat') || String(item.type || '').includes('doctor')) return App.t('notificationMessages.chatUpdate');
  return App.translatePhrase(item.message || '');
}

function getPatientNotificationAction(item) {
  if (item.relatedPrescriptionId || item.type === 'prescription_uploaded') {
    return { label: App.t('buttons.viewPrescription'), href: '/prescriptions.html' };
  }
  if (item.relatedAppointmentId || item.type.startsWith('appointment_')) {
    return { label: App.t('buttons.viewAppointment'), href: '/appointments.html' };
  }
  if (item.type === 'emergency_update') {
    return { label: App.t('buttons.openDashboard'), href: '/patient-dashboard.html' };
  }
  if (item.relatedChatId || item.type.includes('chat') || item.type.includes('doctor')) {
    return { label: App.t('buttons.openChat'), href: '/chat.html' };
  }
  return { label: App.t('buttons.openDashboard'), href: '/patient-dashboard.html' };
}

async function openPatientNotification(event, id, href) {
  event?.preventDefault();
  await markPatientNotificationRead(id, { silent: true });
  window.location.href = href;
}

async function markPatientNotificationRead(id, options = {}) {
  try {
    await App.request(`/api/notifications/${id}/read`, { method: 'PATCH' });
    await renderPatientNotifications();
  } catch (error) {
    if (!options.silent) alert(error.message);
  }
}

async function markNotificationsRead() {
  const user = App.user;
  if (!user) return;
  try {
    await App.request(`/api/notifications/read-all/${user._id}`, { method: 'PATCH' });
    localStorage.setItem('patientUnread', '0');
    App.updatePatientNotificationBadges(0);
    await renderPatientNotifications();
  } catch (error) {
    alert(error.message);
  }
}

window.refreshPatientNotifications = renderPatientNotifications;

function escapeForClass(value) {
  return String(value || 'notification').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function escapeForAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
