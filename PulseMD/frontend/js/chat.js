let chatSocket;
let room;
let activeDoctor;
let activeAppointmentId;
let doctorChatStarted = false;
let botTyping = false;
let intakeRequestId = '';
let intakeSummaryText = '';
let patientChatStatus = 'open';
let intakeCaseId = '';
let intakeTranscript = [];
let chatbotSessionId = '';
let activeFamilyMemberId = localStorage.getItem('activeFamilyMemberId') || '';

const preInfo = {
  name: '',
  age: '',
  weight: '',
  gender: '',
  symptoms: '',
  duration: '',
  severity: '',
  existingDiseases: '',
  currentMedicines: '',
  allergies: ''
};

const intakeSteps = [
  { key: 'name', questionKey: 'ai.questions.name' },
  { key: 'age', questionKey: 'ai.questions.age' },
  { key: 'weight', questionKey: 'ai.questions.weight' },
  { key: 'gender', questionKey: 'ai.questions.gender', options: [
    { value: 'Male', labelKey: 'ai.options.male' },
    { value: 'Female', labelKey: 'ai.options.female' },
    { value: 'Other', labelKey: 'ai.options.other' }
  ] },
  { key: 'symptoms', questionKey: 'ai.questions.symptoms' },
  { key: 'duration', questionKey: 'ai.questions.duration' },
  { key: 'severity', questionKey: 'ai.questions.severity', options: [
    { value: 'Mild', labelKey: 'ai.options.mild' },
    { value: 'Moderate', labelKey: 'ai.options.moderate' },
    { value: 'Severe', labelKey: 'ai.options.severe' }
  ] },
  { key: 'existingDiseases', questionKey: 'ai.questions.existingDiseases' },
  { key: 'currentMedicines', questionKey: 'ai.questions.currentMedicines' },
  { key: 'allergies', questionKey: 'ai.questions.allergies' }
];

const emergencySymptomKeywords = [
  'chest pain',
  'severe breathing',
  'breathing problem',
  'unconscious',
  'unconsciousness',
  'heavy bleeding',
  'stroke',
  'face drooping',
  'seizure'
];

let intakeIndex = 0;

function t(key, values = {}) {
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, value);
  }, App.t(key));
}

function aiMessage(key, values = {}) {
  return { key, values, text: t(key, values) };
}

async function initChat() {
  App.mountPatientNav('chat');
  await App.initI18n();
  await App.applyLanguage();
  App.requireAuth();
  App.connectPatientNotifications();
  await App.loadPatientNotificationCount();
  room = localStorage.getItem('doctorRoom');
  activeDoctor = JSON.parse(localStorage.getItem('activeDoctor') || 'null');
  activeAppointmentId = localStorage.getItem('activeAppointmentId') || '';

  if (!room || !activeAppointmentId) {
    alert(t('ai.alerts.choosePaidAppointment'));
    window.location.href = '/appointments.html';
    return;
  }

  const appointment = await App.request(`/api/payment/appointment/${activeAppointmentId}`);
  if (appointment.paymentStatus !== 'paid') {
    alert(t('ai.alerts.completePayment'));
    window.location.href = `/payment.html?appointmentId=${activeAppointmentId}`;
    return;
  }

  const doctorName = activeDoctor?.user?.name ? `${t('labels.dr')} ${activeDoctor.user.name}` : t('labels.doctor');
  if ($('#chatDoctorName')) $('#chatDoctorName').textContent = doctorName;
  await loadPatientChatList();
  $('#roomName').textContent = t('ai.title');
  $('#chatStatus').textContent = t('ai.statusCollecting');
  setDoctorActionsEnabled(false);
  ChatAttachments.init();
  ChatVoice.init({
    getContext: () => ({
      roomId: room,
      receiverId: room,
      appointmentId: activeAppointmentId || null,
      familyMemberId: activeFamilyMemberId || null
    }),
    canRecord: () => doctorChatStarted && patientChatStatus !== 'closed'
  });

  const savedInfo = loadSavedPreInfo();
  if (savedInfo?.completed) {
    Object.assign(preInfo, savedInfo.preInfo);
    intakeRequestId = savedInfo.requestId || '';
    intakeCaseId = savedInfo.caseId || '';
    intakeTranscript = Array.isArray(savedInfo.chatMessages) ? savedInfo.chatMessages : [];
    intakeSummaryText = savedInfo.aiSummary || makeLocalIntakeSummary();
    if (savedInfo.waiting) {
      startWaitingForDoctor();
    } else {
      await startDoctorChat();
    }
    return;
  }

  startAiIntake();
}

function startAiIntake() {
  doctorChatStarted = false;
  intakeIndex = 0;
  intakeCaseId = '';
  intakeTranscript = [];
  chatbotSessionId = '';
  $('#messages').innerHTML = '';
  setChatInputState(true, 'ai.placeholders.answerAssistant');
  startChatbotSession();
  addBotMessage(aiMessage('ai.welcomeMessage'), () => {
    askCurrentQuestion();
  });
}

async function startChatbotSession() {
  try {
    const data = await App.request('/api/chatbot/start', {
      method: 'POST',
      body: JSON.stringify({
        doctorId: room,
        appointmentId: activeAppointmentId || null
      })
    });
    chatbotSessionId = data.session?._id || '';
  } catch (error) {
    console.warn('Could not start chatbot session:', error.message);
  }
}

function askCurrentQuestion() {
  const step = intakeSteps[intakeIndex];
  if (!step) {
    showIntakeSummary();
    return;
  }

  addBotMessage(aiMessage(step.questionKey), () => {
    if (step.options) renderQuickReplies(step.options);
  });
}

function sendMessage(event) {
  event.preventDefault();
  if (doctorChatStarted && patientChatStatus === 'closed') {
    updatePatientChatBanner('ai.banner.closed', 'closed');
    setChatInputState(false, 'ai.placeholders.chatClosed');
    return;
  }
  const input = $('#messageInput');
  const message = input.value.trim();
  if (!message && !ChatAttachments.getSelectedFile()) return;
  if (ChatVoice.hasPreview()) {
    handleChatError({ message: 'Send or delete the voice preview before sending text.' });
    return;
  }
  if (botTyping) return;

  if (!doctorChatStarted) {
    if (ChatAttachments.getSelectedFile()) {
      handleChatError({ message: 'Finish the AI intake before attaching files for the doctor.' });
      return;
    }
    handleAiAnswer(message);
    input.value = '';
    return;
  }

  if (ChatAttachments.getSelectedFile()) {
    ChatAttachments.send({
      roomId: room,
      receiverId: room,
      appointmentId: activeAppointmentId || null,
      familyMemberId: activeFamilyMemberId || null,
      caption: message
    });
    input.value = '';
    return;
  }

  chatSocket.emit('sendMessage', {
    room,
    receiverId: room,
    appointmentId: activeAppointmentId || null,
    familyMemberId: activeFamilyMemberId || null,
    message
  });
  input.value = '';
}

async function loadPatientChatList() {
  const list = $('#chatContact');
  if (!list) return;

  try {
    const data = await App.request('/api/chat/list');
    const chats = Array.isArray(data.chats) ? data.chats : [];
    if (!chats.length) {
      const doctorName = activeDoctor?.user?.name || t('labels.doctor');
      list.innerHTML = `
        <div class="avatar avatar-fallback" data-initials="👨‍⚕️">👨‍⚕️</div>
        <div>
          <strong>${escapeHtml(doctorName)}</strong>
          <p class="muted">${escapeHtml(t('ai.secureChat'))}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = chats.map((chat) => {
      const doctor = chat.doctorId || {};
      const doctorId = doctor._id || chat.roomId;
      const isActive = String(doctorId) === String(room);
      const lastMessage = chat.lastMessage?.messageType === 'audio'
        ? 'Voice message'
        : chat.lastMessage?.fileName || chat.lastMessage?.text || t('ai.secureChat');
      return `
        <button type="button" class="chat-contact ${isActive ? 'active' : ''}" onclick="openPatientChatFromList('${escapeForAttr(doctorId)}', '${escapeForAttr(chat.appointmentId || '')}', '${escapeForAttr(doctor.name || 'Doctor')}')">
          <span class="avatar avatar-fallback" data-initials="👨‍⚕️">👨‍⚕️</span>
          <span>
            <strong>${escapeHtml(doctor.name || t('labels.doctor'))}</strong>
            <small>${escapeHtml(lastMessage).slice(0, 72)}</small>
          </span>
          <em>${escapeHtml(formatPatientChatStatus(chat.status || 'open'))}</em>
        </button>
      `;
    }).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message || 'Could not load chats.')}</p>`;
  }
}

function openPatientChatFromList(doctorId, appointmentId = '', doctorName = 'Doctor') {
  if (!doctorId || String(doctorId) === String(room)) return;
  localStorage.setItem('doctorRoom', doctorId);
  if (appointmentId) localStorage.setItem('activeAppointmentId', appointmentId);
  localStorage.setItem('activeDoctor', JSON.stringify({ user: { _id: doctorId, name: doctorName } }));
  window.location.href = '/chat.html';
}

function handleAiAnswer(value) {
  const step = intakeSteps[intakeIndex];
  if (!step) return;
  const cleanValue = value.trim();

  if (!validateIntakeAnswer(step, cleanValue)) return;

  addUserBubble(formatPreInfoValue(step.key, cleanValue));
  preInfo[step.key] = cleanValue;
  if (step.key === 'symptoms' || step.key === 'severity') {
    maybeShowEmergencyWarning(cleanValue);
  }
  intakeIndex += 1;
  clearQuickReplies();
  setChatInputState(false);

  setTimeout(() => askCurrentQuestion(), 250);
}

function maybeShowEmergencyWarning(value) {
  const lower = String(value || '').toLowerCase();
  const matched = emergencySymptomKeywords.some((keyword) => lower.includes(keyword));
  if (!matched && preInfo.severity !== 'Severe') return;

  addBotMessage(aiMessage('ai.emergency.message'), () => {
    const warning = document.createElement('article');
    warning.className = 'doctor-card emergency-chat-warning';
    warning.innerHTML = `
      <span class="status-pill severe" data-i18n="ai.emergency.badge">${t('ai.emergency.badge')}</span>
      <h2 data-i18n="ai.emergency.title">${t('ai.emergency.title')}</h2>
      <p class="muted" data-i18n="ai.emergency.desc">${t('ai.emergency.desc')}</p>
      <button type="button" class="danger" onclick="App.openEmergencyPanel()" data-i18n="common.emergencyHelp">${t('common.emergencyHelp')}</button>
    `;
    $('#messages').appendChild(warning);
    scrollMessages();
  });
}

function renderQuickReplies(options) {
  clearQuickReplies();
  const wrap = document.createElement('div');
  wrap.id = 'quickReplies';
  wrap.className = 'quick-replies';
  wrap.innerHTML = options.map((option) => (
    `<button type="button" class="secondary" data-i18n="${option.labelKey}" onclick="handleAiAnswer('${escapeForAttr(option.value)}')">${escapeHtml(t(option.labelKey))}</button>`
  )).join('');
  $('#messages').appendChild(wrap);
  scrollMessages();
  setChatInputState(true, 'ai.placeholders.chooseOption');
}

function clearQuickReplies() {
  const existing = $('#quickReplies');
  if (existing) existing.remove();
}

function showIntakeSummary() {
  intakeSummaryText = makeLocalIntakeSummary();

  addBotMessage(aiMessage('ai.summary.reviewMessage'), () => {
    renderIntakeSummaryCard({ showActions: true });
    const actions = document.createElement('div');
    actions.id = 'intakeActions';
    actions.className = 'quick-replies intake-actions';
    actions.innerHTML = `
      <button type="button" onclick="connectToDoctor()" data-i18n="ai.sendToDoctor">${t('ai.sendToDoctor')}</button>
      <button type="button" class="secondary" onclick="editPreInfo()" data-i18n="ai.editInfo">${t('ai.editInfo')}</button>
    `;
    $('#messages').appendChild(actions);
    setChatInputState(true, 'ai.placeholders.reviewSummary');
    scrollMessages();
  });
}

function editPreInfo() {
  Object.keys(preInfo).forEach((key) => {
    preInfo[key] = '';
  });
  clearQuickReplies();
  const actions = $('#intakeActions');
  if (actions) actions.remove();
  startAiIntake();
}

async function connectToDoctor() {
  clearQuickReplies();
  const actions = $('#intakeActions');
  if (actions) actions.remove();
  setChatInputState(true, 'ai.placeholders.sendingDoctor');
  addBotMessage(aiMessage('ai.summary.sending'), async () => {
    try {
      const preferredSpecialty = activeDoctor?.specialization || activeDoctor?.specialty || activeDoctor?.user?.specialty || '';
      const data = await App.request('/api/ai-chat/save-case', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: room,
          appointmentId: activeAppointmentId || null,
          familyMemberId: activeFamilyMemberId || null,
          preInfo,
          aiSummary: intakeSummaryText || makeLocalIntakeSummary(),
          chatMessages: intakeTranscript,
          preferredSpecialty
        })
      });
      await App.request('/api/chatbot/save', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: chatbotSessionId || null,
          doctorId: room,
          appointmentId: activeAppointmentId || null,
          familyMemberId: activeFamilyMemberId || null,
          preInfo,
          messages: intakeTranscript,
          summary: intakeSummaryText || makeLocalIntakeSummary()
        })
      }).catch(() => {});
      intakeRequestId = data.request?._id || data.case?._id || '';
      intakeCaseId = data.case?._id || '';
      intakeSummaryText = data.case?.aiSummary || data.request?.aiSummary || intakeSummaryText || makeLocalIntakeSummary();
      savePreInfo({ requestId: intakeRequestId, caseId: intakeCaseId, waiting: true, aiSummary: intakeSummaryText, chatMessages: intakeTranscript });
      addBotMessage(aiMessage('ai.summary.shared'));
      startWaitingForDoctor();
    } catch (error) {
      addBotMessage({ text: error.message || t('ai.errors.couldNotSendDetails') });
      setChatInputState(false);
    }
  });
}

function startWaitingForDoctor() {
  doctorChatStarted = false;
  const doctorName = activeDoctor?.user?.name ? `${t('labels.dr')} ${activeDoctor.user.name}` : t('labels.doctor');
  $('#roomName').textContent = doctorName;
  $('#chatStatus').textContent = t('ai.statusWaitingReview');
  setDoctorActionsEnabled(false);
  setChatInputState(true, 'ai.placeholders.waitingDoctor');
  $('#messages').innerHTML = '';
  addBotMessage(aiMessage('ai.summary.waitingReview'));
  renderIntakeSummaryCard({ showActions: false });
  renderWaitingCard();
  connectWaitingSocket();
}

function renderWaitingCard() {
  const card = document.createElement('article');
  card.className = 'doctor-card intake-waiting-card';
  card.innerHTML = `
    <span class="status-pill active" data-i18n="ai.waiting.requestSent">${t('ai.waiting.requestSent')}</span>
    <h2 data-i18n="ai.waiting.title">${t('ai.waiting.title')}</h2>
    <p class="muted" data-i18n="ai.waiting.desc">${t('ai.waiting.desc')}</p>
    <div class="waiting-dots" aria-label="${escapeForAttr(t('status.waiting'))}"><span></span><span></span><span></span></div>
  `;
  $('#messages').appendChild(card);
  scrollMessages();
}

function connectWaitingSocket() {
  if (chatSocket?.connected) return;
  chatSocket = App.socket();
  chatSocket.on('connect', () => {
    chatSocket.emit('joinRoom', { room });
  });
  chatSocket.on('chatError', handleChatError);
  chatSocket.on('receiveMessage', (message) => {
    const text = message.text || '';
    if (text.startsWith('Doctor has joined')) {
      startDoctorChat(message);
      return;
    }
    if (text.includes('request was reviewed')) {
      updateWaitingStatus('ai.waiting.requestDeclined', 'ai.waiting.requestDeclinedDesc', 'rejected');
    }
    if (text.includes('marked your request for later')) {
      updateWaitingStatus('ai.waiting.markedLater', 'ai.waiting.markedLaterDesc', 'pending');
    }
    addMessage(message);
  });
}

async function startDoctorChat(joinedMessage = null) {
  doctorChatStarted = true;
  savePreInfo({ requestId: intakeRequestId, waiting: false, aiSummary: intakeSummaryText || makeLocalIntakeSummary() });
  const doctorName = activeDoctor?.user?.name ? `${t('labels.dr')} ${activeDoctor.user.name}` : t('labels.doctor');
  $('#roomName').textContent = doctorName;
  $('#chatStatus').textContent = t('ai.statusConnecting');
  setDoctorActionsEnabled(true);
  setChatInputState(false, 'ai.placeholders.typeMessage');
  $('#messages').innerHTML = '';
  renderIntakeSummaryCard({ showActions: false, joined: true });
  await loadPatientChatStatus();

  if (!chatSocket) chatSocket = App.socket();

  try {
    const history = await App.request(`/api/patient/messages/${room}`);
    history.forEach(addMessage);
    if (joinedMessage && !history.some((item) => item._id === joinedMessage._id)) addMessage(joinedMessage);
    await App.request(`/api/messages/conversation/${room}/read`, { method: 'PATCH' });
  } catch (error) {
    $('#chatStatus').textContent = error.message;
    $('#chatStatus').classList.add('error');
  }

  if (!chatSocket.connected) {
    chatSocket.on('connect', () => {
      chatSocket.emit('joinRoom', { room });
      $('#chatStatus').textContent = t('status.connected');
    });
  } else {
    chatSocket.emit('joinRoom', { room });
    $('#chatStatus').textContent = t('status.connected');
  }

  chatSocket.off('receiveMessage');
  chatSocket.off('chatError');
  chatSocket.on('roomJoined', () => {
    $('#chatStatus').textContent = t('ai.statusHistorySynced');
  });

  chatSocket.on('receiveMessage', addMessage);
  chatSocket.on('chatError', handleChatError);
  chatSocket.on('chatStatusUpdated', handlePatientChatStatusUpdate);

  chatSocket.on('connect_error', () => {
    $('#chatStatus').textContent = t('ai.errors.connectionFailed');
    $('#chatStatus').classList.add('error');
  });
}

function handleChatError(error = {}) {
  const status = $('#chatStatus');
  if (!status) return;
  status.textContent = error.message || t('ai.errors.couldNotSendMessage');
  status.classList.add('error');
}

function formatPreInfoValue(key, value) {
  if (!value) return '-';
  const optionKey = {
    Male: 'ai.options.male',
    Female: 'ai.options.female',
    Other: 'ai.options.other',
    Mild: 'ai.options.mild',
    Moderate: 'ai.options.moderate',
    Severe: 'ai.options.severe'
  }[value];
  return optionKey ? t(optionKey) : value;
}

function renderIntakeSummaryCard({ showActions = false, joined = false } = {}) {
  const existing = $('#patientIntakeSummaryCard');
  if (existing) existing.remove();

  const card = document.createElement('article');
  card.id = 'patientIntakeSummaryCard';
  card.className = 'chat-intake-summary-card patient-intake-summary-card';
  const severityLabel = formatPreInfoValue('severity', preInfo.severity || '') || t('status.pending');
  card.innerHTML = `
    <div class="request-detail-head">
      <div>
        <span class="status-pill severity-${escapeForClass(preInfo.severity)}">${escapeHtml(severityLabel)}</span>
        <h2 data-i18n="ai.summary.title">${t('ai.summary.title')}</h2>
        <p class="muted">${joined ? t('ai.summary.sharedWithDoctor') : t('ai.summary.reviewBeforeDoctor')}</p>
      </div>
      ${joined ? `<span class="status-pill active" data-i18n="ai.status.doctorJoined">${t('ai.status.doctorJoined')}</span>` : ''}
    </div>
    <div class="request-detail-grid">
      <p><strong>${t('ai.summary.fields.name')}:</strong> ${escapeHtml(formatPreInfoValue('name', preInfo.name))}</p>
      <p><strong>${t('ai.summary.fields.age')}:</strong> ${escapeHtml(formatPreInfoValue('age', preInfo.age))}</p>
      <p><strong>${t('ai.summary.fields.weight')}:</strong> ${escapeHtml(formatPreInfoValue('weight', preInfo.weight))}</p>
      <p><strong>${t('ai.summary.fields.gender')}:</strong> ${escapeHtml(formatPreInfoValue('gender', preInfo.gender))}</p>
      <p><strong>${t('ai.summary.fields.symptoms')}:</strong> ${escapeHtml(formatPreInfoValue('symptoms', preInfo.symptoms))}</p>
      <p><strong>${t('ai.summary.fields.duration')}:</strong> ${escapeHtml(formatPreInfoValue('duration', preInfo.duration))}</p>
      <p><strong>${t('ai.summary.fields.severity')}:</strong> ${escapeHtml(formatPreInfoValue('severity', preInfo.severity))}</p>
      <p><strong>${t('ai.summary.fields.existingDiseases')}:</strong> ${escapeHtml(formatPreInfoValue('existingDiseases', preInfo.existingDiseases))}</p>
      <p><strong>${t('ai.summary.fields.currentMedicines')}:</strong> ${escapeHtml(formatPreInfoValue('currentMedicines', preInfo.currentMedicines))}</p>
      <p><strong>${t('ai.summary.fields.allergies')}:</strong> ${escapeHtml(formatPreInfoValue('allergies', preInfo.allergies))}</p>
    </div>
    <div class="ai-summary-box">
      <strong data-i18n="ai.summary.forDoctor">${t('ai.summary.forDoctor')}</strong>
      <p>${escapeHtml(makeLocalIntakeSummary())}</p>
    </div>
  `;

  const messages = $('#messages');
  if (showActions) {
    const actions = $('#intakeActions');
    if (actions) {
      messages.insertBefore(card, actions);
    } else {
      messages.appendChild(card);
    }
  } else {
    messages.insertBefore(card, messages.firstChild);
  }
  scrollMessages();
}

function updateWaitingStatus(titleKey, messageKey, stateClass = 'pending') {
  const card = document.querySelector('.intake-waiting-card');
  if (!card) return;
  const title = t(titleKey);
  card.innerHTML = `
    <span class="status-pill ${stateClass}">${escapeHtml(title)}</span>
    <h2>${escapeHtml(title)}</h2>
    <p class="muted">${escapeHtml(t(messageKey))}</p>
  `;
  $('#chatStatus').textContent = title;
  setChatInputState(true, titleKey);
}

function validateIntakeAnswer(step, value) {
  if (!value) {
    addBotMessage(aiMessage('ai.validation.required'));
    return false;
  }

  if (step.key === 'age') {
    const age = Number(value);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      addBotMessage(aiMessage('ai.validation.age'));
      return false;
    }
  }

  if (step.key === 'weight') {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight < 1 || weight > 350) {
      addBotMessage(aiMessage('ai.validation.weight'));
      return false;
    }
  }

  if (step.options && !step.options.some((option) => option.value === value)) {
    addBotMessage(aiMessage('ai.validation.chooseOne', {
      options: step.options.map((option) => t(option.labelKey)).join(', ')
    }));
    return false;
  }

  return true;
}

function makeLocalIntakeSummary() {
  return [
    t('ai.summary.patientSummary'),
    '',
    `* ${t('ai.summary.fields.name')}: ${formatPreInfoValue('name', preInfo.name)}`,
    `* ${t('ai.summary.fields.age')}: ${formatPreInfoValue('age', preInfo.age)}`,
    `* ${t('ai.summary.fields.weight')}: ${formatPreInfoValue('weight', preInfo.weight)}`,
    `* ${t('ai.summary.fields.gender')}: ${formatPreInfoValue('gender', preInfo.gender)}`,
    `* ${t('ai.summary.fields.symptoms')}: ${formatPreInfoValue('symptoms', preInfo.symptoms)}`,
    `* ${t('ai.summary.fields.duration')}: ${formatPreInfoValue('duration', preInfo.duration)}`,
    `* ${t('ai.summary.fields.severity')}: ${formatPreInfoValue('severity', preInfo.severity)}`,
    `* ${t('ai.summary.fields.existingDiseases')}: ${formatPreInfoValue('existingDiseases', preInfo.existingDiseases)}`,
    `* ${t('ai.summary.fields.currentMedicines')}: ${formatPreInfoValue('currentMedicines', preInfo.currentMedicines)}`,
    `* ${t('ai.summary.fields.allergies')}: ${formatPreInfoValue('allergies', preInfo.allergies)}`,
    `* ${t('ai.summary.notes')}`
  ].join('\n');
}

function formatPreInfoSummaryForDoctor() {
  return [
    t('ai.summary.doctorSummary'),
    `${t('ai.summary.fields.name')}: ${preInfo.name || '-'}`,
    `${t('ai.summary.fields.age')}: ${preInfo.age || '-'}`,
    `${t('ai.summary.fields.weight')}: ${preInfo.weight || '-'}`,
    `${t('ai.summary.fields.gender')}: ${formatPreInfoValue('gender', preInfo.gender)}`,
    `${t('ai.summary.fields.symptoms')}: ${preInfo.symptoms || '-'}`,
    `${t('ai.summary.fields.duration')}: ${preInfo.duration || '-'}`,
    `${t('ai.summary.fields.severity')}: ${formatPreInfoValue('severity', preInfo.severity)}`,
    `${t('ai.summary.fields.existingDiseases')}: ${preInfo.existingDiseases || '-'}`,
    `${t('ai.summary.fields.currentMedicines')}: ${preInfo.currentMedicines || '-'}`,
    `${t('ai.summary.fields.allergies')}: ${preInfo.allergies || '-'}`
  ].join('\n');
}

async function startChatCall(mode) {
  if (!room || !activeAppointmentId || !doctorChatStarted) return;

  localStorage.setItem('doctorRoom', room);
  localStorage.setItem('activeAppointmentId', activeAppointmentId);
  localStorage.setItem('callMode', mode === 'audio' ? 'audio' : 'video');
  if (activeDoctor) localStorage.setItem('activeDoctor', JSON.stringify(activeDoctor));
  try {
    const data = await App.request('/api/video-call/start', {
      method: 'POST',
      body: JSON.stringify({
        patientId: App.user._id,
        doctorId: room,
        appointmentId: activeAppointmentId,
        callType: mode === 'audio' ? 'audio' : 'video'
      })
    });
    localStorage.setItem('activeVideoCallId', data.call?._id || '');
    $('#chatStatus').textContent = t('ai.statusCallRinging');
  } catch (error) {
    console.warn('Could not save call state:', error.message);
  }
  window.location.href = '/video.html';
}

function addBotMessage(message, afterRender) {
  const messageKey = typeof message === 'object' ? message.key : '';
  const messageValues = typeof message === 'object' ? message.values || {} : {};
  const text = typeof message === 'object' ? message.text : String(message || '');
  recordIntakeTranscript('bot', text, '', messageKey, messageValues);
  botTyping = true;
  setChatInputState(true);
  const typing = document.createElement('div');
  typing.className = 'message bot-message typing-message';
  if (messageKey) typing.dataset.i18nKey = messageKey;
  if (messageKey) typing.dataset.i18nValues = JSON.stringify(messageValues);
  typing.innerHTML = `
    <small><span data-i18n="ai.senderName">${t('ai.senderName')}</span><span>${formatDateTime(new Date())}</span></small>
    <div class="typing-dots" aria-label="${escapeForAttr(t('ai.typing'))}"><span></span><span></span><span></span></div>
  `;
  $('#messages').appendChild(typing);
  scrollMessages();

  setTimeout(() => {
    typing.classList.remove('typing-message');
    typing.innerHTML = `
      <small><span data-i18n="ai.senderName">${t('ai.senderName')}</span><span>${formatDateTime(new Date())}</span></small>
      <div class="bot-message-text">${escapeHtml(messageKey ? t(messageKey, messageValues) : text).replace(/\n/g, '<br>')}</div>
    `;
    botTyping = false;
    setChatInputState(false);
    scrollMessages();
    if (afterRender) afterRender();
  }, 650);
}

function addUserBubble(text) {
  recordIntakeTranscript('patient', text, intakeSteps[intakeIndex]?.key || '');
  const node = document.createElement('div');
  node.className = 'message mine';
  node.innerHTML = `
    <small><span data-i18n="ai.you">${t('ai.you')}</span><span>${formatDateTime(new Date())}</span></small>
    <div>${escapeHtml(text)}</div>
  `;
  $('#messages').appendChild(node);
  scrollMessages();
}

function recordIntakeTranscript(sender, text, step = '', messageKey = '', messageValues = {}) {
  if (doctorChatStarted || !text) return;
  intakeTranscript.push({
    sender,
    text,
    messageKey,
    messageValues,
    step,
    createdAt: new Date().toISOString()
  });
}

function addMessage(message) {
  const senderId = message.sender?._id || message.sender;
  const isMine = senderId === App.user._id;
  const isSystem = message.type === 'system';
  const senderName = isSystem ? 'PulseMD - Virtual Clinic' : isMine ? t('ai.you') : message.sender?.name || t('labels.doctor');
  const systemKey = isSystem ? systemMessageKey(message.text) : '';
  const messageText = systemKey ? t(systemKey) : message.text;
  const node = document.createElement('div');
  node.className = `message ${isMine ? 'mine' : ''} ${isSystem ? 'system-message' : ''}`;
  if (systemKey) node.dataset.i18nKey = systemKey;
  node.innerHTML = `
    <small><span>${escapeHtml(senderName)}</span><span>${formatDateTime(message.createdAt)}</span></small>
    ${message.messageType === 'audio' ? ChatVoice.renderMessageContent(message) : message.fileUrl ? ChatAttachments.renderMessageContent(message) : `<div class="${systemKey ? 'system-message-text' : ''}">${escapeHtml(messageText).replace(/\n/g, '<br>')}</div>`}
  `;
  $('#messages').appendChild(node);
  scrollMessages();
  if (doctorChatStarted) loadPatientChatList().catch(() => {});

  if (message.text === 'Prescription has been shared by doctor.') {
    applyPatientChatStatus({ status: 'prescription_sent' });
  }
  if (message.text === 'Doctor closed this consultation chat.') {
    applyPatientChatStatus({ status: 'closed' });
  }
  if (message.text === 'Doctor reopened this consultation chat.') {
    applyPatientChatStatus({ status: 'reopened' });
  }
}

function systemMessageKey(text = '') {
  const messages = {
    'Prescription has been shared by doctor.': 'ai.system.prescriptionShared',
    'Doctor closed this consultation chat.': 'ai.system.closed',
    'Doctor reopened this consultation chat.': 'ai.system.reopened'
  };
  if (messages[text]) return messages[text];
  if (String(text).startsWith('Doctor has joined')) return 'ai.system.doctorJoined';
  return '';
}

async function loadPatientChatStatus() {
  try {
    const data = await App.request(`/api/chat/${room}/status`);
    applyPatientChatStatus(data.chat || data);
  } catch (error) {
    applyPatientChatStatus({ status: 'open' });
  }
}

function handlePatientChatStatusUpdate(update = {}) {
  applyPatientChatStatus(update);
  loadPatientChatList().catch(() => {});
}

function applyPatientChatStatus(chat = {}) {
  patientChatStatus = chat.status || 'open';
  const badge = $('#patientConsultationStatusBadge');
  const input = $('#messageInput');
  const button = document.querySelector('.chat-form button[type="submit"]');
  const attachButton = $('#chatAttachmentBtn');
  const voiceButton = $('#voiceRecordBtn');
  const prescriptionCard = $('#patientPrescriptionCard');
  const isClosed = patientChatStatus === 'closed';
  const hasPrescription = patientChatStatus === 'prescription_sent' || Boolean(chat.prescriptionId);
  const prescriptionSent = hasPrescription || Boolean(chat.prescriptionSent);

  if (badge) {
    badge.hidden = false;
    badge.textContent = formatPatientChatStatus(patientChatStatus);
    badge.className = `status-pill chat-${escapeForClass(patientChatStatus)}`;
  }

  if (doctorChatStarted) {
    if (input) input.disabled = isClosed;
    if (button) button.disabled = isClosed;
    if (attachButton) attachButton.disabled = isClosed;
    if (voiceButton) voiceButton.disabled = isClosed;
  }

  if (prescriptionCard) prescriptionCard.hidden = !prescriptionSent;

  if (isClosed) {
    updatePatientChatBanner('ai.banner.closed', 'closed');
    if (input) input.placeholder = t('ai.placeholders.chatClosed');
  } else if (patientChatStatus === 'reopened') {
    updatePatientChatBanner('ai.banner.reopened', 'reopened');
    if (input) input.placeholder = t('ai.placeholders.typeMessage');
  } else if (prescriptionSent) {
    updatePatientChatBanner('ai.banner.prescriptionShared', 'prescription_sent');
  } else {
    updatePatientChatBanner('', 'open');
  }
}

function updatePatientChatBanner(messageKey, state = 'open') {
  const banner = $('#patientChatBanner');
  if (!banner) return;
  const message = messageKey ? t(messageKey) : '';
  banner.hidden = !messageKey;
  banner.className = `chat-status-banner chat-${escapeForClass(state)}`;
  banner.dataset.i18nKey = messageKey || '';
  banner.innerHTML = message ? `<strong>${escapeHtml(message)}</strong>` : '';
}

function formatPatientChatStatus(status = 'open') {
  const key = `ai.status.${String(status || 'open')}`;
  const translated = App.getByPath(App.translations[App.currentLanguage()], key) || App.getByPath(App.translations.en, key);
  return translated || String(status || 'open').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function setChatInputState(disabled, placeholder = '') {
  const input = $('#messageInput');
  const button = document.querySelector('.chat-form button[type="submit"]');
  const attachButton = $('#chatAttachmentBtn');
  const voiceButton = $('#voiceRecordBtn');
  if (!input || !button) return;
  input.disabled = Boolean(disabled);
  button.disabled = Boolean(disabled);
  if (attachButton) attachButton.disabled = Boolean(disabled) || !doctorChatStarted || patientChatStatus === 'closed';
  if (voiceButton) voiceButton.disabled = Boolean(disabled) || !doctorChatStarted || patientChatStatus === 'closed';
  if (placeholder) {
    input.dataset.activePlaceholderKey = placeholder.startsWith('ai.') || placeholder.startsWith('status.') ? placeholder : '';
    input.placeholder = input.dataset.activePlaceholderKey ? t(placeholder) : placeholder;
  }
  if (!disabled && !doctorChatStarted) {
    input.dataset.activePlaceholderKey = 'ai.inputPlaceholder';
    input.placeholder = t('ai.inputPlaceholder');
  }
}

function setDoctorActionsEnabled(enabled) {
  const actions = document.querySelector('.chat-call-actions');
  if (actions) actions.hidden = !enabled;
  document.querySelectorAll('.call-button').forEach((button) => {
    button.disabled = !enabled;
  });
}

async function renderChatI18n() {
  await App.initI18n();
  document.title = t('ai.pageTitle');

  const doctorName = activeDoctor?.user?.name ? `${t('labels.dr')} ${activeDoctor.user.name}` : t('labels.doctor');
  if ($('#chatDoctorName')) $('#chatDoctorName').textContent = doctorName;
  if ($('#roomName')) $('#roomName').textContent = doctorChatStarted || document.querySelector('.intake-waiting-card') ? doctorName : t('ai.title');

  const status = $('#chatStatus');
  const currentStatusKey = status ? findKnownAiKey(status.textContent) : '';
  if (status && currentStatusKey) status.textContent = t(currentStatusKey);

  document.querySelectorAll('.bot-message[data-i18n-key]').forEach((node) => {
    const textNode = node.querySelector('.bot-message-text');
    if (!textNode) return;
    let values = {};
    try {
      values = JSON.parse(node.dataset.i18nValues || '{}');
    } catch (error) {
      values = {};
    }
    textNode.innerHTML = escapeHtml(t(node.dataset.i18nKey, values)).replace(/\n/g, '<br>');
  });

  document.querySelectorAll('.system-message[data-i18n-key]').forEach((node) => {
    const textNode = node.querySelector('.system-message-text');
    if (textNode) textNode.innerHTML = escapeHtml(t(node.dataset.i18nKey)).replace(/\n/g, '<br>');
  });

  if (document.querySelector('#patientIntakeSummaryCard')) {
    renderIntakeSummaryCard({ showActions: Boolean($('#intakeActions')), joined: doctorChatStarted });
  }
  const waitingCard = document.querySelector('.intake-waiting-card');
  if (waitingCard) {
    waitingCard.remove();
    renderWaitingCard();
  }

  const banner = $('#patientChatBanner');
  if (banner?.dataset.i18nKey) updatePatientChatBanner(banner.dataset.i18nKey, patientChatStatus);
  const activePlaceholderKey = $('#messageInput')?.dataset.activePlaceholderKey;
  if (activePlaceholderKey) $('#messageInput').placeholder = t(activePlaceholderKey);
  if (doctorChatStarted || !$('#patientConsultationStatusBadge')?.hidden) {
    applyPatientChatStatus({ status: patientChatStatus });
  }
}

function findKnownAiKey(value = '') {
  const keys = [
    'ai.statusCollecting',
    'ai.statusConnecting',
    'ai.statusWaitingReview',
    'ai.statusHistorySynced',
    'ai.statusCallRinging',
    'status.connected',
    'ai.errors.connectionFailed',
    'ai.errors.couldNotSendMessage'
  ];
  return keys.find((key) => {
    return ['en', 'hi'].some((lang) => {
      const source = App.getByPath(App.translations[lang], key);
      return source && source === value;
    });
  }) || '';
}

function scrollMessages() {
  const messages = $('#messages');
  messages.scrollTop = messages.scrollHeight;
}

window.renderChatI18n = renderChatI18n;

function savePreInfo(extra = {}) {
  localStorage.setItem(getPreInfoStorageKey(), JSON.stringify({
    completed: true,
    preInfo,
    requestId: intakeRequestId,
    caseId: intakeCaseId,
    aiSummary: intakeSummaryText,
    chatMessages: intakeTranscript,
    ...extra
  }));
}

function loadSavedPreInfo() {
  try {
    return JSON.parse(localStorage.getItem(getPreInfoStorageKey()) || 'null');
  } catch (error) {
    return null;
  }
}

function getPreInfoStorageKey() {
  return `caremitraPreInfo:${activeAppointmentId || room}`;
}

function escapeForAttr(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeForClass(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
