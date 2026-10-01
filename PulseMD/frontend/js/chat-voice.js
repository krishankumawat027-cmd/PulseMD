(function () {
  let mediaRecorder = null;
  let mediaStream = null;
  let chunks = [];
  let startedAt = 0;
  let timerId = null;
  let audioBlob = null;
  let audioUrl = '';
  let duration = 0;
  let isUploading = false;
  let uploadFailed = false;
  let config = {};

  function init(options = {}) {
    config = { autoSendOnStop: false, ...options };
    const micButton = document.querySelector(options.micButton || '#voiceRecordBtn');
    const stopButton = document.querySelector(options.stopButton || '#voiceStopBtn');
    const cancelButton = document.querySelector(options.cancelButton || '#voiceCancelBtn');
    const sendButton = document.querySelector(options.sendButton || '#voiceSendBtn');

    if (!micButton) return;
    if (sendButton && config.autoSendOnStop) sendButton.hidden = true;
    micButton.addEventListener('click', toggleRecording);
    stopButton?.addEventListener('click', stopRecording);
    cancelButton?.addEventListener('click', cancelRecording);
    sendButton?.addEventListener('click', sendRecording);
    resetUi();
  }

  function hasPreview() {
    return Boolean(audioBlob);
  }

  function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }
    startRecording();
  }

  async function startRecording() {
    clearStatus();
    if (isUploading) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showStatus('Voice recording is not supported in this browser. Please use Chrome or Edge.', true);
      return;
    }
    if (config.canRecord && !config.canRecord()) {
      showStatus('Voice messages are available after the chat is open.', true);
      return;
    }

    try {
      uploadFailed = false;
      cleanupPreview();
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getBestMimeType();
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      chunks = [];
      startedAt = Date.now();
      duration = 0;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      mediaRecorder.onstop = buildPreview;
      mediaRecorder.start(250);
      setRecordingUi(true);
      showStatus('Recording...', false);
      startTimer();
    } catch (error) {
      cleanupStream();
      showStatus('Microphone permission was denied or unavailable. Please allow microphone access and try again.', true);
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    mediaRecorder.stop();
    stopTimer();
    cleanupStream();
    setRecordingUi(false);
  }

  function cancelRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    stopTimer();
    cleanupStream();
    cleanupPreview();
    resetUi();
    showStatus('Voice recording cancelled.', false);
  }

  function buildPreview() {
    if (!chunks.length) {
      resetUi();
      showStatus('Recording was empty. Please try again.', true);
      return;
    }
    audioBlob = new Blob(chunks, { type: chunks[0].type || mediaRecorder?.mimeType || 'audio/webm' });
    if (!audioBlob.size || duration <= 0) {
      cleanupPreview();
      resetUi();
      showStatus('Recording was too short. Please try again.', true);
      return;
    }

    audioUrl = URL.createObjectURL(audioBlob);
    const panel = getPanel();
    const player = document.querySelector(config.previewAudio || '#voicePreviewAudio');
    const durationNode = document.querySelector(config.previewDuration || '#voicePreviewDuration');
    if (player) player.src = audioUrl;
    if (durationNode) durationNode.textContent = formatDuration(duration);
    if (panel) panel.hidden = false;
    if (config.autoSendOnStop) {
      showStatus('Sending voice message...', false);
      setTimeout(() => {
        sendRecording();
      }, 0);
      return;
    }
    showStatus('Preview your voice message before sending.', false);
  }

  async function sendRecording() {
    if (!audioBlob || isUploading) return;
    const context = typeof config.getContext === 'function' ? config.getContext() : {};
    if (!context.roomId || !context.receiverId) {
      showStatus('Choose a chat before sending a voice message.', true);
      return;
    }
    if (config.canRecord && !config.canRecord()) {
      showStatus('This chat is closed. Reopen it before sending a voice message.', true);
      return;
    }

    isUploading = true;
    setUploadingUi(true);
    try {
      uploadFailed = false;
      const formData = new FormData();
      // Cloudinary accepts browser audio best through multipart upload, avoiding base64 payload limits.
      const extension = audioBlob.type.includes('mp4') ? 'm4a' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
      formData.append('audio', audioBlob, `voice-message-${Date.now()}.${extension}`);
      formData.append('roomId', context.roomId);
      formData.append('receiverId', context.receiverId);
      formData.append('appointmentId', context.appointmentId || '');
      formData.append('familyMemberId', context.familyMemberId || localStorage.getItem('activeFamilyMemberId') || '');
      formData.append('duration', String(duration));

      const response = await fetch(`${window.API_BASE || localStorage.getItem('API_BASE') || ''}/api/chat/upload-audio`, {
        method: 'POST',
        headers: {
          ...(App.token ? { Authorization: `Bearer ${App.token}` } : {})
        },
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not send voice message.');

      cleanupPreview();
      resetUi();
      showStatus('Voice message sent.', false);
    } catch (error) {
      uploadFailed = true;
      showStatus(error.message || 'Voice upload failed. Please try again.', true);
      const sendButton = document.querySelector(config.sendButton || '#voiceSendBtn');
      if (sendButton && config.autoSendOnStop) {
        sendButton.hidden = false;
        sendButton.disabled = false;
        sendButton.textContent = 'Retry voice';
      }
    } finally {
      isUploading = false;
      setUploadingUi(false);
    }
  }

  function renderMessageContent(message = {}) {
    const src = message.audioUrl || message.fileUrl || '';
    const time = formatDuration(Number(message.duration || 0));
    return `
      <div class="voice-message-player">
        <span class="voice-message-icon">Mic</span>
        <audio controls preload="metadata" src="${escapeForAttr(src)}"></audio>
        <span class="voice-message-duration">${escapeHtml(time)}</span>
      </div>
    `;
  }

  function getBestMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function startTimer() {
    updateTimer(0);
    timerId = setInterval(() => {
      updateTimer(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function updateTimer(seconds) {
    const timer = document.querySelector(config.timer || '#voiceTimer');
    if (timer) timer.textContent = formatDuration(seconds);
  }

  function setRecordingUi(recording) {
    document.querySelector(config.recorder || '#voiceRecorder')?.classList.toggle('recording', recording);
    const micButton = document.querySelector(config.micButton || '#voiceRecordBtn');
    const stopButton = document.querySelector(config.stopButton || '#voiceStopBtn');
    const cancelButton = document.querySelector(config.cancelButton || '#voiceCancelBtn');
    if (micButton) {
      micButton.disabled = recording ? false : Boolean(config.canRecord && !config.canRecord());
      micButton.classList.toggle('recording', recording);
      micButton.textContent = recording ? 'Stop' : 'Mic';
      micButton.setAttribute('aria-label', recording ? 'Stop voice recording' : 'Start voice recording');
      micButton.setAttribute('title', recording ? 'Stop voice recording' : 'Start voice recording');
    }
    if (stopButton) stopButton.hidden = !recording;
    if (cancelButton) cancelButton.hidden = !recording;
  }

  function setUploadingUi(uploading) {
    const sendButton = document.querySelector(config.sendButton || '#voiceSendBtn');
    const cancelButton = document.querySelector(config.cancelButton || '#voiceCancelBtn');
    const micButton = document.querySelector(config.micButton || '#voiceRecordBtn');
    const attachButton = document.querySelector(config.attachButton || '#chatAttachmentBtn');
    const submitButton = document.querySelector(config.form || '.chat-form')?.querySelector('button[type="submit"]');
    if (sendButton) {
      sendButton.disabled = uploading;
      sendButton.textContent = uploading ? 'Sending...' : uploadFailed ? 'Retry voice' : 'Send voice';
      if (config.autoSendOnStop) sendButton.hidden = uploading || !audioBlob;
    }
    if (cancelButton) cancelButton.disabled = uploading;
    if (micButton) micButton.disabled = uploading;
    if (attachButton) attachButton.disabled = uploading;
    if (submitButton) submitButton.disabled = uploading;
  }

  function resetUi() {
    setRecordingUi(false);
    setUploadingUi(false);
    updateTimer(0);
    const panel = getPanel();
    if (panel) panel.hidden = true;
  }

  function getPanel() {
    return document.querySelector(config.preview || '#voicePreview');
  }

  function cleanupStream() {
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    mediaRecorder = null;
  }

  function cleanupPreview() {
    chunks = [];
    audioBlob = null;
    uploadFailed = false;
    duration = 0;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = '';
    const player = document.querySelector(config.previewAudio || '#voicePreviewAudio');
    if (player) player.removeAttribute('src');
  }

  function clearStatus() {
    const status = document.querySelector(config.status || '#chatAttachmentError');
    if (!status) return;
    status.hidden = true;
    status.textContent = '';
    status.classList.remove('error', 'success');
  }

  function showStatus(message, isError) {
    const status = document.querySelector(config.status || '#chatAttachmentError');
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
    status.classList.toggle('success', !isError);
  }

  function formatDuration(seconds = 0) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const rest = Math.floor(value % 60);
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
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

  function escapeForAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  window.ChatVoice = {
    init,
    hasPreview,
    renderMessageContent
  };
}());
