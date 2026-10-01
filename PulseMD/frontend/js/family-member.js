let activeFamilyMemberId = '';
let activeFamilyMemberData = null;

async function initFamilyMemberPage() {
  App.mountPatientNav('dashboard');
  const user = App.requireAuth();
  if (!user) return;
  await App.initI18n();

  const params = new URLSearchParams(window.location.search);
  activeFamilyMemberId = params.get('id') || '';
  if (activeFamilyMemberId) await loadFamilyMember(activeFamilyMemberId);
}

async function loadFamilyMember(memberId) {
  const status = $('#familyMemberStatus');
  try {
    if (status) status.textContent = 'Loading family profile...';
    const data = await App.request(`/api/family-members/${memberId}`);
    activeFamilyMemberData = data;
    fillFamilyForm(data.member);
    renderFamilyProfile(data);
    if (status) status.textContent = '';
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  }
}

function fillFamilyForm(member) {
  const form = $('#familyMemberForm');
  if (!form || !member) return;
  $('#familyPageTitle').textContent = `Family profile: ${member.fullName}`;
  for (const [key, value] of Object.entries(member)) {
    const field = form.elements[key];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value || '';
  }
}

function renderFamilyProfile(data) {
  const { member, appointments = [], prescriptions = [], reports = [], symptomHistory = [] } = data;
  const summary = $('#familySummaryCard');
  const summaryWrap = $('#familyProfileSummary');
  const timeline = $('#familyMedicalTimeline');
  const book = $('#bookMemberBtn');
  if (!member) return;

  localStorage.setItem('activeFamilyMemberId', member._id);
  localStorage.setItem('activeFamilyMemberName', member.fullName);

  if (book) {
    book.hidden = false;
    book.href = `/doctors.html?familyMemberId=${encodeURIComponent(member._id)}`;
  }
  if (summaryWrap) summaryWrap.hidden = false;
  if (timeline) timeline.hidden = false;

  if (summary) {
    const initials = (member.fullName || 'FM').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    summary.innerHTML = `
      <div class="family-card-head">
        ${member.profilePhotoUrl ? `<img class="family-avatar large" src="${escapeForAttr(member.profilePhotoUrl)}" alt="${escapeForAttr(member.fullName)}">` : `<div class="avatar avatar-fallback family-avatar large">${escapeHtml(initials)}</div>`}
        <div>
          <h2>${escapeHtml(member.fullName)}</h2>
          <p class="muted">${escapeHtml(member.relation)} &bull; ${escapeHtml(String(member.age))} years</p>
        </div>
      </div>
      <div class="family-card-meta stacked">
        <span><strong>Blood group</strong>${escapeHtml(member.bloodGroup || 'Not set')}</span>
        <span><strong>Health status</strong>${escapeHtml(member.quickHealthStatus || 'Stable')}</span>
        <span><strong>Emergency</strong>${escapeHtml(member.emergencyContact || 'Not set')}</span>
        <span><strong>Last updated</strong>${formatDateTime(member.updatedAt)}</span>
      </div>
    `;
  }

  renderRecordList('#memberAppointments', appointments, (item) => `
    <strong>${escapeHtml(item.doctor?.name || 'Doctor')}</strong>
    <p class="muted">${formatDateTime(item.scheduledAt)} - ${escapeHtml(App.tStatus(item.status))}</p>
    <p>${escapeHtml(item.reason || item.symptomSummary || 'General consultation')}</p>
  `);
  renderRecordList('#memberPrescriptions', prescriptions, (item) => `
    <strong>Dr. ${escapeHtml(item.doctor?.name || 'Doctor')}</strong>
    <p class="muted">${formatDateTime(item.prescriptionDate || item.createdAt)}</p>
    <p>${escapeHtml(item.advice || item.notes || 'Prescription shared')}</p>
  `);
  renderRecordList('#memberReports', reports, (item) => `
    <strong>${escapeHtml(item.title || item.fileName || 'Medical report')}</strong>
    <p class="muted">${escapeHtml(item.type || 'report')} - ${formatDateTime(item.createdAt)}</p>
    ${item.fileUrl ? `<a class="button secondary" href="${escapeForAttr(item.fileUrl)}" target="_blank" rel="noopener">Open file</a>` : ''}
  `);
  renderRecordList('#memberSymptomHistory', symptomHistory, (item) => `
    <strong>${escapeHtml(App.translatePhrase(item.suggestedSpecialty || 'General Physician'))}</strong>
    <p class="muted">${formatDateTime(item.createdAt)} - ${escapeHtml(App.tStatus(item.urgencyLevel))}</p>
    <p>${escapeHtml(App.translatePhrase(item.symptomText || item.symptoms?.join(', ') || 'Symptoms recorded'))}</p>
  `);
}

function renderRecordList(selector, items, template) {
  const node = $(selector);
  if (!node) return;
  node.innerHTML = items.length
    ? items.map((item) => `<article class="family-record-item">${template(item)}</article>`).join('')
    : '<p class="muted">No records yet.</p>';
}

async function saveFamilyMember(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#familyMemberStatus');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.isSelf = form.elements.isSelf.checked;

  try {
    if (status) {
      status.textContent = 'Saving family profile...';
      status.classList.remove('error');
    }
    const result = await App.request(activeFamilyMemberId ? `/api/family-members/${activeFamilyMemberId}` : '/api/family-members', {
      method: activeFamilyMemberId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    activeFamilyMemberId = result.member._id;
    if (status) status.textContent = result.message || 'Family profile saved.';
    window.history.replaceState(null, '', `/family-member.html?id=${activeFamilyMemberId}`);
    await loadFamilyMember(activeFamilyMemberId);
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  }
}

async function uploadFamilyReport(event) {
  event.preventDefault();
  if (!activeFamilyMemberId) return;
  const form = event.currentTarget;
  const status = $('#familyMemberStatus');
  const submit = form.querySelector('button[type="submit"]');

  try {
    if (status) {
      status.textContent = 'Uploading report...';
      status.classList.remove('error');
    }
    if (submit) submit.disabled = true;
    await App.request(`/api/family-members/${activeFamilyMemberId}/reports`, {
      method: 'POST',
      body: new FormData(form),
      isFormData: true
    });
    form.reset();
    if (status) status.textContent = 'Report uploaded.';
    await loadFamilyMember(activeFamilyMemberId);
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

function escapeForAttr(value) {
  return String(value || '').replace(/'/g, '&#039;').replace(/"/g, '&quot;');
}
