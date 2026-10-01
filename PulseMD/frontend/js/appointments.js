async function loadPatientAppointments(options = {}) {
  if (!options.preserveShell) App.mountPatientNav('appointments');
  App.requireAuth();
  await App.initI18n();
  const body = $('#appointmentsBody');

  try {
    const appointments = await App.request('/api/appointments');

    if (!appointments.length) {
      body.innerHTML = `<tr><td colspan="7">${App.t('empty.noAppointments')}</td></tr>`;
      return;
    }

    body.innerHTML = appointments.map((item) => `
      <tr>
        <td>${escapeHtml(item.doctor?.name || App.t('labels.doctor'))}${item.familyMemberId ? `<br><small class="muted">For ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</small>` : ''}</td>
        <td>${formatDateTime(item.scheduledAt)}</td>
        <td>${escapeHtml(item.reason || App.t('labels.generalConsultation'))}</td>
        <td>${formatMoney(item.consultationFee)}</td>
        <td><span class="status-pill ${item.paymentStatus}">${App.tStatus(item.paymentStatus)}</span></td>
        <td><span class="status-pill ${item.status}">${App.tStatus(item.status)}</span></td>
        <td class="actions">
          ${item.paymentStatus === 'pending' || item.status === 'payment_pending'
            ? `<button onclick="payForAppointment('${item._id}')">${App.t('buttons.payNow')}</button>`
            : ''}
          <button class="secondary" ${item.paymentStatus === 'paid' ? '' : 'disabled'} onclick="continueWithDoctor('${item.doctor?._id || item.doctor}', '${item._id}', 'chat', '${escapeForAttr(item.doctor?.name || App.t('labels.doctor'))}', '${escapeForAttr(item.familyMemberId?._id || '')}', '${escapeForAttr(item.familyMemberId?.fullName || '')}')">${App.t('buttons.chat')}</button>
          <button class="secondary" ${item.paymentStatus === 'paid' ? '' : 'disabled'} onclick="continueWithDoctor('${item.doctor?._id || item.doctor}', '${item._id}', 'video', '${escapeForAttr(item.doctor?.name || App.t('labels.doctor'))}', '${escapeForAttr(item.familyMemberId?._id || '')}', '${escapeForAttr(item.familyMemberId?.fullName || '')}')">${App.t('buttons.video')}</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
}

window.loadPatientAppointments = loadPatientAppointments;

function continueWithDoctor(doctorId, appointmentId, mode, doctorName = 'Doctor', familyMemberId = '', familyMemberName = '') {
  localStorage.setItem('doctorRoom', doctorId);
  localStorage.setItem('activeAppointmentId', appointmentId);
  if (familyMemberId) {
    localStorage.setItem('activeFamilyMemberId', familyMemberId);
    localStorage.setItem('activeFamilyMemberName', familyMemberName);
  } else {
    localStorage.removeItem('activeFamilyMemberId');
    localStorage.removeItem('activeFamilyMemberName');
  }
  localStorage.setItem('callMode', mode === 'video' ? 'video' : 'chat');
  localStorage.setItem('activeDoctor', JSON.stringify({ user: { _id: doctorId, name: doctorName } }));
  window.location.href = mode === 'chat' ? '/chat.html' : '/video.html';
}

function payForAppointment(appointmentId) {
  localStorage.setItem('activeAppointmentId', appointmentId);
  window.location.href = `/payment.html?appointmentId=${appointmentId}`;
}

function escapeForAttr(value) {
  return String(value || '').replace(/'/g, '&#039;').replace(/"/g, '&quot;');
}
