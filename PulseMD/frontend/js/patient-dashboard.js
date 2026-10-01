let dashboardAppointments = [];
let symptomRecognition = null;
let symptomVoiceSupported = false;
let symptomVoiceListening = false;
let symptomFinalTranscript = '';
let symptomInterimTranscript = '';

async function initPatientDashboard() {
  App.mountPatientNav('dashboard');
  const user = App.requireAuth();
  if (!user) return;

  await App.initI18n();
  if (user.role === 'doctor') {
    window.location.href = '/doctor-dashboard.html';
    return;
  }

  App.connectPatientNotifications();
  await App.loadPatientNotificationCount();

  populateDashboardIdentity(user);
  ensureEmergencyFab();
  initSymptomVoiceInput();
  await App.applyLanguage();
  renderDashboardDate();

  try {
    dashboardAppointments = await App.request('/api/appointments');
    renderDashboardAppointments(dashboardAppointments);
  } catch (error) {
    const recentAppointments = $('#recentAppointments');
    if (recentAppointments) {
      recentAppointments.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
    }
  }

  await loadWearableDashboardSummary();
  await loadFamilyProfiles();
  await loadSymptomHistory();
}

window.renderDashboardI18n = async () => {
  await App.applyLanguage();
  renderDashboardDate();

  const fab = document.querySelector('.emergency-fab');
  const fabLabel = fab?.querySelector('[data-i18n="dashboard.emergencyHelp"]');
  if (fabLabel) fabLabel.textContent = App.t('dashboard.emergencyHelp');

  renderDashboardAppointments(dashboardAppointments);
  await loadFamilyProfiles();
  await loadWearableDashboardSummary();
  await loadSymptomHistory();
};

function populateDashboardIdentity(user) {
  const name = $('#dashboardUserName');
  const profileChip = document.querySelector('.dashboard-profile-chip span');
  const profileAvatar = document.querySelector('.dashboard-profile-chip .avatar');
  const fallbackName = user.name || App.t('labels.patient');
  const initials = (user.name || App.t('labels.patient'))
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (name) name.textContent = fallbackName;
  if (profileChip) profileChip.textContent = fallbackName;
  if (profileAvatar) {
    profileAvatar.textContent = initials;
    profileAvatar.dataset.initials = initials;
  }
}

function ensureEmergencyFab() {
  if (document.querySelector('.emergency-fab')) return;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<button type="button" class="danger emergency-fab" onclick="App.startEmergencyHelp()">
      <span class="dashboard-emergency-icon" aria-hidden="true">${App.medIcon('emergency')}</span>
      <span data-i18n="dashboard.emergencyHelp">${App.t('dashboard.emergencyHelp')}</span>
    </button>`
  );
}

function renderDashboardDate() {
  const date = $('#dashboardDate');
  if (!date) return;

  const locale = App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN';
  date.textContent = new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function renderDashboardAppointments(appointments = []) {
  const allAppointments = Array.isArray(appointments) ? appointments : [];
  const appointmentCount = $('#appointmentCount');
  const pendingCount = $('#pendingCount');
  const confirmedCount = $('#confirmedCount');
  const paymentDueCount = $('#paymentDueCount');
  const recentAppointments = $('#recentAppointments');

  if (appointmentCount) appointmentCount.textContent = allAppointments.length;
  if (pendingCount) {
    pendingCount.textContent = allAppointments.filter((item) => ['pending', 'payment_pending'].includes(item.status)).length;
  }
  if (confirmedCount) {
    confirmedCount.textContent = allAppointments.filter((item) => item.status === 'confirmed').length;
  }
  if (paymentDueCount) {
    paymentDueCount.textContent = allAppointments.filter((item) => item.paymentStatus === 'pending' || item.status === 'payment_pending').length;
  }

  if (!recentAppointments) return;

  const recent = allAppointments.slice(0, 4);
  recentAppointments.innerHTML = recent.length
    ? recent.map((item) => {
      const doctorName = item.doctor?.name || App.t('labels.doctor');
      const doctorInitials = (item.doctor?.name || 'DR')
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return `
        <article class="chat-contact">
          <div class="avatar avatar-fallback" data-initials="${escapeHtml(doctorInitials)}">${escapeHtml(doctorInitials)}</div>
          <div>
            <strong>${escapeHtml(doctorName)}</strong>
            ${item.familyMemberId ? `<p class="muted">For ${escapeHtml(item.familyMemberId.fullName)} (${escapeHtml(item.familyMemberId.relation)})</p>` : ''}
            <p class="muted">${formatDateTime(item.scheduledAt)}</p>
            <span class="status-pill ${escapeForClass(item.status)}">${escapeHtml(App.tStatus(item.status))}</span>
          </div>
        </article>
      `;
    }).join('')
    : `<p class="muted">${App.t('empty.noAppointments')}</p>`;
}

async function loadFamilyProfiles() {
  const list = $('#familyProfilesList');
  const status = $('#familyProfilesStatus');
  if (!list) return;

  const params = new URLSearchParams();
  const search = $('#familySearch')?.value?.trim();
  const relation = $('#familyRelationFilter')?.value?.trim();
  if (search) params.set('search', search);
  if (relation) params.set('relation', relation);

  if (status) {
    status.textContent = 'Loading family profiles...';
    status.classList.remove('error');
  }

  try {
    const members = await App.request(`/api/family-members${params.toString() ? `?${params}` : ''}`);
    if (status) status.textContent = members.length ? '' : 'No family profiles yet. Add your first member or sample data.';
    list.innerHTML = members.length
      ? members.map(renderFamilyMemberCard).join('')
      : `<article class="family-empty-card">
          <strong>Start with your family</strong>
          <p class="muted">Create separate patient identities for self, parents, children, or any shared-phone family member.</p>
          <a class="button" href="/family-member.html">Add family member</a>
        </article>`;
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
    list.innerHTML = '';
  }
}

function renderFamilyMemberCard(member) {
  const initials = (member.fullName || 'FM')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const photo = member.profilePhotoUrl
    ? `<img class="family-avatar" src="${escapeForAttr(member.profilePhotoUrl)}" alt="${escapeForAttr(member.fullName)}">`
    : `<div class="avatar avatar-fallback family-avatar" data-initials="${escapeHtml(initials)}">${escapeHtml(initials)}</div>`;

  return `
    <article class="family-member-card">
      <div class="family-card-head">
        ${photo}
        <div>
          <h3>${escapeHtml(member.fullName)}</h3>
          <p class="muted">${escapeHtml(member.relation || 'Family member')} &bull; ${escapeHtml(String(member.age || ''))} years</p>
        </div>
      </div>
      <div class="family-card-meta">
        <span><strong>Blood</strong>${escapeHtml(member.bloodGroup || 'Not set')}</span>
        <span><strong>Status</strong>${escapeHtml(member.quickHealthStatus || 'Stable')}</span>
      </div>
      <div class="actions family-card-actions">
        <a class="button secondary" href="/family-member.html?id=${encodeURIComponent(member._id)}">View</a>
        <a class="button secondary" href="/family-member.html?id=${encodeURIComponent(member._id)}&edit=1">Edit</a>
        <button type="button" class="secondary" onclick="bookForFamilyMember('${escapeForAttr(member._id)}', '${escapeForAttr(member.fullName)}')">Book Appointment</button>
        <button type="button" class="danger" onclick="deleteFamilyMember('${escapeForAttr(member._id)}')">Delete</button>
      </div>
    </article>
  `;
}

function bookForFamilyMember(memberId, memberName) {
  localStorage.setItem('activeFamilyMemberId', memberId);
  localStorage.setItem('activeFamilyMemberName', memberName);
  window.location.href = `/doctors.html?familyMemberId=${encodeURIComponent(memberId)}`;
}

async function seedFamilyMembers() {
  const status = $('#familyProfilesStatus');
  try {
    if (status) {
      status.textContent = 'Adding sample family profiles...';
      status.classList.remove('error');
    }
    const data = await App.request('/api/family-members/seed', { method: 'POST' });
    if (status) status.textContent = data.message || 'Sample profiles added.';
    await loadFamilyProfiles();
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  }
}

async function deleteFamilyMember(memberId) {
  if (!window.confirm('Delete this family profile? Profiles with medical history will be archived instead.')) return;
  const status = $('#familyProfilesStatus');
  try {
    const data = await App.request(`/api/family-members/${memberId}`, { method: 'DELETE' });
    if (status) status.textContent = data.message || 'Family profile updated.';
    await loadFamilyProfiles();
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  }
}

async function loadWearableDashboardSummary() {
  const warning = $('#wearableDataWarning');
  const steps = $('#wearableSteps');
  const heartRate = $('#wearableHeartRate');
  const sleep = $('#wearableSleep');
  const trend = $('#wearableWeeklyTrend');
  const lastSynced = $('#wearableLastSynced');
  const stepsSource = $('#wearableStepsSource');
  const heartSource = $('#wearableHeartRateSource');
  const sleepSource = $('#wearableSleepSource');

  if (!steps || !heartRate || !sleep || !trend || !lastSynced) return;

  try {
    const data = await App.request('/api/wearables/summary');
    const cards = data.cards || {};
    const weeklyTrends = Array.isArray(cards.weeklyTrends) ? cards.weeklyTrends : [];
    const weeklyAverage = weeklyTrends.length
      ? Math.round(weeklyTrends.reduce((total, item) => total + Number(item.value || 0), 0) / weeklyTrends.length)
      : 0;

    steps.textContent = Number(cards.todaySteps?.value || 0)
      ? Number(cards.todaySteps.value).toLocaleString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN')
      : '--';
    heartRate.textContent = Number(cards.latestHeartRate?.value || 0) ? `${cards.latestHeartRate.value} bpm` : '--';
    sleep.textContent = Number(cards.lastNightSleep?.value || 0) ? `${cards.lastNightSleep.value} h` : '--';
    trend.textContent = weeklyAverage ? `${weeklyAverage.toLocaleString(App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN')} steps/day` : '--';

    if (stepsSource) stepsSource.textContent = App.t('dashboard.dataSourcePlaceholder').replace('--', cards.todaySteps?.sourceDevice || '--');
    if (heartSource) heartSource.textContent = App.t('dashboard.dataSourcePlaceholder').replace('--', cards.latestHeartRate?.sourceDevice || '--');
    if (sleepSource) sleepSource.textContent = App.t('dashboard.dataSourcePlaceholder').replace('--', cards.lastNightSleep?.sourceDevice || '--');
    if (lastSynced) lastSynced.textContent = App.t('dashboard.lastSyncedPlaceholder').replace('--', data.lastSyncedAt ? formatDateTime(data.lastSyncedAt) : '--');
    if (warning) {
      warning.hidden = !data.dataNotUpdated;
      warning.classList.remove('error');
      warning.textContent = App.t('dashboard.wearableWarning');
    }
  } catch (error) {
    if (warning) {
      warning.hidden = false;
      warning.textContent = App.translatePhrase(error.message);
      warning.classList.add('error');
    }
    if (steps) steps.textContent = '--';
    if (heartRate) heartRate.textContent = '--';
    if (sleep) sleep.textContent = '--';
    if (trend) trend.textContent = '--';
  }
}

async function syncAllWearables() {
  const warning = $('#wearableDataWarning');
  const button = document.querySelector('.wearable-dashboard-card button[onclick="syncAllWearables()"]');
  const originalText = button?.textContent || App.t('dashboard.syncNow');

  if (warning) {
    warning.hidden = false;
    warning.classList.remove('error');
    warning.textContent = App.translatePhrase('Syncing health data securely...');
  }
  if (button) {
    button.disabled = true;
    button.textContent = App.translatePhrase('Syncing...');
  }

  try {
    const status = await App.request('/api/wearables/status');
    const connected = (status.connections || [])
      .filter((item) => item.syncStatus === 'CONNECTED' || item.syncStatus === 'SYNCING')
      .map((item) => item.provider);

    if (!connected.length) {
      if (warning) {
        warning.textContent = App.translatePhrase('Connect a wearable from Profile before syncing.');
        warning.classList.add('error');
      }
      return;
    }

    const results = await Promise.all(connected.map((provider) => App.request(`/api/wearables/sync/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ mock: true })
    })));
    const saved = results.reduce((sum, item) => sum + Number(item.recordsSaved || 0), 0);
    if (warning) {
      warning.textContent = `${App.translatePhrase('Last synced.')} ${saved} ${App.translatePhrase('records saved.')}`;
      warning.classList.remove('error');
    }
    await loadWearableDashboardSummary();
  } catch (error) {
    if (warning) {
      warning.textContent = App.translatePhrase(error.message);
      warning.classList.add('error');
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function toggleSymptomChip(button) {
  button.classList.toggle('is-selected');
  button.setAttribute('aria-pressed', String(button.classList.contains('is-selected')));
}

function initSymptomVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  symptomVoiceSupported = Boolean(SpeechRecognition);

  const startButton = $('#symptomStartVoiceBtn');
  const stopButton = $('#symptomStopVoiceBtn');
  const restartButton = $('#symptomRestartVoiceBtn');
  const micButton = $('#symptomMicButton');

  if (!symptomVoiceSupported) {
    setSymptomVoiceStatus('Voice input is not supported on this browser. Please type your symptoms.', { error: true });
    [startButton, stopButton, restartButton, micButton].forEach((button) => {
      if (button) button.disabled = true;
    });
    return;
  }

  symptomRecognition = new SpeechRecognition();
  symptomRecognition.continuous = false;
  symptomRecognition.interimResults = true;
  symptomRecognition.maxAlternatives = 1;
  symptomRecognition.lang = $('#symptomVoiceLanguage')?.value || 'en-IN';

  symptomRecognition.onstart = () => {
    symptomVoiceListening = true;
    updateSymptomVoiceControls();
    setSymptomVoiceStatus('Listening...');
  };

  symptomRecognition.onresult = (event) => {
    let interim = '';
    let finalText = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript || '';
      if (event.results[index].isFinal) {
        finalText += transcript;
      } else {
        interim += transcript;
      }
    }

    symptomInterimTranscript = cleanTranscript(interim);
    if (finalText) {
      symptomFinalTranscript = cleanTranscript(`${symptomFinalTranscript} ${finalText}`);
      applySymptomTranscript(symptomFinalTranscript);
    } else if (symptomInterimTranscript) {
      previewSymptomTranscript(symptomInterimTranscript);
    }
  };

  symptomRecognition.onspeechend = () => {
    setSymptomVoiceStatus('Processing...');
    stopSymptomVoiceInput();
  };

  symptomRecognition.onerror = (event) => {
    symptomVoiceListening = false;
    updateSymptomVoiceControls();
    const messages = {
      'not-allowed': 'Microphone permission was denied. Please allow microphone access or type your symptoms.',
      'service-not-allowed': 'Speech recognition is blocked for this browser. Please type your symptoms.',
      'no-speech': 'No speech was detected. Try again or type your symptoms.',
      'audio-capture': 'No microphone was found. Connect a microphone or type your symptoms.',
      network: 'Speech recognition network error. Please try again or type your symptoms.',
      aborted: 'Voice input stopped.'
    };
    setSymptomVoiceStatus(messages[event.error] || 'Voice input failed. Please try again or type your symptoms.', {
      error: !['aborted', 'no-speech'].includes(event.error)
    });
  };

  symptomRecognition.onend = () => {
    symptomVoiceListening = false;
    updateSymptomVoiceControls();
    if (symptomFinalTranscript || $('#symptomText')?.value.trim()) {
      setSymptomVoiceStatus('Ready');
    } else if (symptomVoiceSupported) {
      setSymptomVoiceStatus('Ready');
    }
  };

  updateSymptomVoiceControls();
  setSymptomVoiceStatus('Ready');
}

async function startSymptomVoiceInput() {
  if (!symptomVoiceSupported || !symptomRecognition) {
    setSymptomVoiceStatus('Voice input is not supported on this browser. Please type your symptoms.', { error: true });
    return;
  }

  if (symptomVoiceListening) return;
  symptomRecognition.lang = $('#symptomVoiceLanguage')?.value || 'en-IN';
  symptomInterimTranscript = '';
  symptomFinalTranscript = $('#symptomText')?.value.trim() || '';

  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }
    symptomRecognition.start();
  } catch (error) {
    const permissionError = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    const noDevice = error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError';
    setSymptomVoiceStatus(
      permissionError
        ? 'Microphone permission was denied. Please allow microphone access or type your symptoms.'
        : noDevice
          ? 'No microphone was found. Connect a microphone or type your symptoms.'
          : 'Could not start voice input. Please try again or type your symptoms.',
      { error: true }
    );
  }
}

function stopSymptomVoiceInput() {
  if (!symptomRecognition || !symptomVoiceListening) return;
  setSymptomVoiceStatus('Processing...');
  try {
    symptomRecognition.stop();
  } catch (error) {
    symptomVoiceListening = false;
    updateSymptomVoiceControls();
  }
}

function restartSymptomVoiceInput() {
  if (symptomVoiceListening) {
    try {
      symptomRecognition.abort();
    } catch (error) {
      // Browser recognizers can throw if already ending; a fresh start below handles it.
    }
  }
  symptomFinalTranscript = '';
  symptomInterimTranscript = '';
  const input = $('#symptomText');
  if (input) input.value = '';
  setTimeout(() => startSymptomVoiceInput(), 180);
}

function toggleSymptomVoiceInput() {
  if (symptomVoiceListening) {
    stopSymptomVoiceInput();
    return;
  }
  startSymptomVoiceInput();
}

function clearSymptomChecker() {
  if (symptomVoiceListening) stopSymptomVoiceInput();
  symptomFinalTranscript = '';
  symptomInterimTranscript = '';
  const input = $('#symptomText');
  if (input) input.value = '';
  document.querySelectorAll('.symptom-chip.is-selected').forEach((chip) => {
    chip.classList.remove('is-selected');
    chip.setAttribute('aria-pressed', 'false');
  });
  const result = $('#symptomAnalysisResult');
  if (result) {
    result.hidden = true;
    result.innerHTML = '';
  }
  const bookButton = $('#bookSuggestedDoctorBtn');
  if (bookButton) bookButton.hidden = true;
  const status = $('#symptomCheckerStatus');
  if (status) {
    status.textContent = '';
    status.classList.remove('error');
  }
  setSymptomVoiceStatus(symptomVoiceSupported ? 'Ready' : 'Voice input is not supported on this browser. Please type your symptoms.', {
    error: !symptomVoiceSupported
  });
}

function setSymptomVoiceStatus(message = 'Ready', options = {}) {
  const panel = $('#symptomVoiceStatus');
  const text = $('#symptomVoiceStatusText');
  if (text) text.textContent = App.translatePhrase(message);
  if (panel) {
    panel.classList.toggle('is-listening', symptomVoiceListening);
    panel.classList.toggle('error', Boolean(options.error));
  }
}

function updateSymptomVoiceControls() {
  const startButton = $('#symptomStartVoiceBtn');
  const stopButton = $('#symptomStopVoiceBtn');
  const restartButton = $('#symptomRestartVoiceBtn');
  const micButton = $('#symptomMicButton');

  if (startButton) startButton.disabled = !symptomVoiceSupported || symptomVoiceListening;
  if (stopButton) stopButton.disabled = !symptomVoiceSupported || !symptomVoiceListening;
  if (restartButton) restartButton.disabled = !symptomVoiceSupported;
  if (micButton) {
    micButton.disabled = !symptomVoiceSupported;
    micButton.classList.toggle('is-listening', symptomVoiceListening);
    micButton.textContent = symptomVoiceListening ? 'Stop' : 'Mic';
    micButton.setAttribute('aria-label', symptomVoiceListening ? 'Stop voice input' : 'Start voice input');
    micButton.setAttribute('title', symptomVoiceListening ? 'Stop voice input' : 'Start voice input');
  }

  const panel = $('#symptomVoiceStatus');
  if (panel) panel.classList.toggle('is-listening', symptomVoiceListening);
}

function applySymptomTranscript(transcript) {
  const input = $('#symptomText');
  if (!input) return;
  input.value = improveTranscriptPunctuation(cleanTranscript(transcript));
}

function previewSymptomTranscript(interimTranscript) {
  const input = $('#symptomText');
  if (!input) return;
  const base = symptomFinalTranscript || input.value.trim();
  input.value = cleanTranscript(`${base} ${interimTranscript}`);
}

function cleanTranscript(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function improveTranscriptPunctuation(value = '') {
  const text = cleanTranscript(value);
  if (!text) return '';
  const withCapital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?।]$/.test(withCapital) ? withCapital : `${withCapital}.`;
}

async function analyzeDashboardSymptoms(event) {
  event.preventDefault();

  const status = $('#symptomCheckerStatus');
  const result = $('#symptomAnalysisResult');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const selectedSymptoms = [...document.querySelectorAll('.symptom-chip.is-selected')]
    .map((chip) => chip.dataset.symptom)
    .filter(Boolean);
  const symptomsText = cleanTranscript($('#symptomText')?.value || '');

  if (!symptomsText && !selectedSymptoms.length) {
    if (status) {
      status.textContent = App.translatePhrase('Enter symptoms or use voice input before analyzing.');
      status.classList.add('error');
    }
    return;
  }

  if (status) {
    status.textContent = App.t('dashboard.analyzingSymptoms');
    status.classList.remove('error');
  }
  if (button) button.disabled = true;

  try {
    const data = await App.request('/api/symptom-checker/analyze', {
      method: 'POST',
      body: JSON.stringify({
        patientId: App.user?._id || '',
        symptomsText,
        language: $('#symptomVoiceLanguage')?.value || App.currentLanguage(),
        symptoms: selectedSymptoms
      })
    });

    const history = data.history;
    const suggestedSpecialty = history.suggestedSpecialty || data.analysis?.suggestedSpecialty || 'General Physician';
    localStorage.setItem('suggestedSymptomHistoryId', history._id);
    localStorage.setItem('suggestedSpecialty', suggestedSpecialty);

    if (result) {
      const departments = (history.suggestedDepartments || [])
        .map((item) => App.translatePhrase(item))
        .join(', ');
      const careAdvice = (history.careAdvice || [])
        .map((item) => `<li>${escapeHtml(App.translatePhrase(item))}</li>`)
        .join('');
      const disclaimer = history.disclaimer || data.disclaimer || App.t('dashboard.aiDisclaimer');
      const possibleConditions = (data.possibleConditions || data.analysis?.possibleConditions || [])
        .map((item) => `<li>${escapeHtml(App.translatePhrase(item))}</li>`)
        .join('');
      const nextAction = data.nextAction || App.translatePhrase('Consult a doctor if symptoms persist, worsen, or you feel unsafe.');

      result.hidden = false;
      result.innerHTML = `
        <div class="symptom-result-head">
          <span class="status-pill ${escapeForClass(history.urgencyLevel)}">${escapeHtml(App.tStatus(history.urgencyLevel))} ${escapeHtml(App.t('dashboard.urgencySuffix'))}</span>
          <h3>${escapeHtml(App.translatePhrase(suggestedSpecialty))}</h3>
        </div>
        <div class="symptom-result-grid">
          <article class="symptom-result-card">
            <h4>Entered symptoms</h4>
            <p>${escapeHtml(history.symptomText || data.symptomsText || selectedSymptoms.join(', '))}</p>
          </article>
          <article class="symptom-result-card">
            <h4>AI summary</h4>
            <p>${escapeHtml(data.summary || data.analysis?.summary || '')}</p>
          </article>
          <article class="symptom-result-card">
            <h4>Possible causes</h4>
            <ul>${possibleConditions || '<li>General symptom review</li>'}</ul>
          </article>
          <article class="symptom-result-card">
            <h4>${escapeHtml(App.t('dashboard.departments'))}</h4>
            <p>${escapeHtml(departments)}</p>
          </article>
          <article class="symptom-result-card">
            <h4>Next recommended action</h4>
            <p>${escapeHtml(App.translatePhrase(nextAction))}</p>
          </article>
          <article class="symptom-result-card">
            <h4>Care advice</h4>
            <ul>${careAdvice}</ul>
          </article>
        </div>
        <p class="muted">${escapeHtml(App.translatePhrase(disclaimer))}</p>
      `;
    }

    const bookButton = $('#bookSuggestedDoctorBtn');
    if (bookButton) {
      bookButton.hidden = false;
      bookButton.href = `/doctors.html?specialty=${encodeURIComponent(suggestedSpecialty)}&symptomHistoryId=${encodeURIComponent(history._id)}`;
      bookButton.textContent = App.t('dashboard.bookSuggestedDoctor');
    }

    if (status) status.textContent = App.t('dashboard.symptomsAnalyzed');
    await loadSymptomHistory();
  } catch (error) {
    if (status) {
      status.textContent = App.translatePhrase(error.message);
      status.classList.add('error');
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadSymptomHistory() {
  const list = $('#symptomHistoryList');
  if (!list) return;

  try {
    const history = await App.request('/api/patient/symptoms/history');
    list.innerHTML = history.length
      ? history.slice(0, 4).map((item) => {
        const summary = item.symptomText || item.symptoms.join(', ') || App.t('dashboard.symptomsRecorded');
        return `
          <article class="mini-history-item">
            <strong>${escapeHtml(App.translatePhrase(item.suggestedSpecialty))}</strong>
            <span class="status-pill ${escapeForClass(item.urgencyLevel)}">${escapeHtml(App.tStatus(item.urgencyLevel))}</span>
            <p class="muted">${escapeHtml(App.translatePhrase(summary))}</p>
            <small>${formatDateTime(item.createdAt)}</small>
          </article>
        `;
      }).join('')
      : `<p class="muted">${App.t('dashboard.noSymptomChecks')}</p>`;
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(App.translatePhrase(error.message))}</p>`;
  }
}

function escapeForClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function escapeForAttr(value) {
  return String(value || '').replace(/'/g, '&#039;').replace(/"/g, '&quot;');
}

async function sharePatientLocation() {
  const status = $('#locationStatus');
  if (status) {
    status.textContent = App.t('dashboard.requestingLocation');
    status.classList.remove('error');
  }

  if (!navigator.geolocation) {
    if (status) {
      status.textContent = App.t('dashboard.locationUnsupported');
      status.classList.add('error');
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const payload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'manual'
        };

        await App.request('/api/location/save', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (status) {
          status.textContent = App.t('dashboard.locationShared');
          status.classList.remove('error');
        }
      } catch (error) {
        if (status) {
          status.textContent = App.translatePhrase(error.message);
          status.classList.add('error');
        }
      }
    },
    (error) => {
      if (!status) return;

      const messages = {
        1: App.t('dashboard.locationDenied'),
        2: App.t('dashboard.locationUnavailable'),
        3: App.t('dashboard.locationTimeout')
      };

      status.textContent = messages[error.code] || App.t('dashboard.locationFailed');
      status.classList.add('error');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}
