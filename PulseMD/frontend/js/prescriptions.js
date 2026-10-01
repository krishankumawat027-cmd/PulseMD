let patientPrescriptions = [];

async function initPatientPrescriptions() {
  App.mountPatientNav('prescriptions');
  App.requireAuth();
  await App.initI18n();
  patientPrescriptions = await App.request('/api/patient/prescriptions');
  renderPrescriptionList();
}

function renderPrescriptionList() {
  const list = $('#prescriptionList');
  if (!patientPrescriptions.length) {
    list.innerHTML = `<p class="muted">${App.t('empty.noPrescriptions')}</p>`;
    return;
  }

  list.innerHTML = patientPrescriptions.map((item, index) => `
    <article class="chat-contact">
      <div class="avatar avatar-fallback" data-initials="💊">💊</div>
      <div>
      <h3>${App.t('labels.dr')} ${escapeHtml(item.doctor?.name || App.t('labels.doctor'))}</h3>
      <p class="muted">${formatDateTime(item.prescriptionDate)}</p>
      ${item.familyMemberId ? `<p class="muted">For ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</p>` : ''}
      <p>${item.medicines.length} ${App.t('labels.medicines')}</p>
      <button onclick="showPrescription(${index})">${App.t('buttons.viewPrescription')}</button>
      </div>
    </article>
  `).join('');
  showPrescription(0);
}

function showPrescription(index) {
  const item = patientPrescriptions[index];
  if (!item) return;
  const detail = $('#prescriptionDetail');
  detail.hidden = false;
  detail.innerHTML = prescriptionMarkup(item);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function prescriptionMarkup(item) {
  return `
    <div class="prescription-head">
      <div>
        <h2>PulseMD - Virtual Clinic Prescription</h2>
        <p class="muted">${App.t('home.tagline')}</p>
      </div>
      <div>
        <p><strong>${App.t('labels.date')}:</strong> ${formatDateTime(item.prescriptionDate)}</p>
        <p><strong>${App.t('labels.doctor')}:</strong> ${App.t('labels.dr')} ${escapeHtml(item.doctor?.name || App.t('labels.doctor'))}</p>
        <p><strong>${App.t('labels.patient')}:</strong> ${escapeHtml(item.patient?.name || App.t('labels.patient'))}</p>
        ${item.familyMemberId ? `<p><strong>Family member:</strong> ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</p>` : ''}
      </div>
    </div>
    <div class="medicine-table-wrap"><table>
      <thead><tr><th>${App.t('labels.medicine')}</th><th>${App.t('labels.dosage')}</th><th>${App.t('labels.timing')}</th><th>${App.t('labels.duration')}</th></tr></thead>
      <tbody>
        ${item.medicines.map((medicine) => `
          <tr>
            <td>${escapeHtml(medicine.name)}</td>
            <td>${escapeHtml(medicine.dosage)}</td>
            <td>${escapeHtml(medicine.timing)}</td>
            <td>${escapeHtml(medicine.duration || '-')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
    <div class="advice-box"><strong>${App.t('labels.doctorAdvice')}:</strong> ${escapeHtml(item.advice || App.t('prescriptions.followAdvice'))}</div>
    <div class="followup-card"><strong>${App.t('labels.followUp')}:</strong> ${App.t('prescriptions.followUpText')}</div>
    <p><strong>${App.t('labels.notes')}:</strong> ${escapeHtml(item.notes || App.t('labels.none'))}</p>
    <div class="actions no-print">
      <button onclick="window.print()">${App.t('buttons.downloadPrint')}</button>
    </div>
  `;
}

window.renderPrescriptionsI18n = async () => {
  renderPrescriptionList();
};
