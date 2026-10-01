(function () {
  const MB = 1024 * 1024;
  const RULES = {
    image: {
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
      maxBytes: 5 * MB,
      label: 'Images can be up to 5MB.'
    },
    pdf: {
      extensions: ['pdf'],
      mimeTypes: ['application/pdf'],
      maxBytes: 10 * MB,
      label: 'PDFs can be up to 10MB.'
    },
    video: {
      extensions: ['mp4', 'webm', 'mov'],
      mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maxBytes: 25 * MB,
      label: 'Videos can be up to 25MB.'
    },
    audio: {
      extensions: ['webm', 'wav', 'mp3', 'm4a', 'ogg'],
      mimeTypes: ['audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
      maxBytes: 10 * MB,
      label: 'Audio files can be up to 10MB.'
    },
    file: {
      extensions: ['doc', 'docx', 'txt', 'rtf'],
      mimeTypes: [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/rtf',
        'text/rtf'
      ],
      maxBytes: 10 * MB,
      label: 'Documents can be up to 10MB.'
    }
  };

  let selectedFile = null;
  let selectedType = '';
  let currentConfig = {};

  function init(config = {}) {
    currentConfig = config;
    const input = document.querySelector(config.fileInput || '#chatAttachmentInput');
    const button = document.querySelector(config.attachButton || '#chatAttachmentBtn');
    const removeButton = document.querySelector(config.removeButton || '#removeAttachmentBtn');

    if (!input || !button) return;
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => handleFileSelection(input.files?.[0] || null));
    removeButton?.addEventListener('click', clear);
    if (!window.__chatAttachmentDelegationBound) {
      document.addEventListener('click', handleAttachmentClick);
      window.__chatAttachmentDelegationBound = true;
    }
  }

  function getSelectedFile() {
    return selectedFile;
  }

  function handleFileSelection(file) {
    clearError();
    if (!file) {
      clear();
      return;
    }

    const validation = validate(file);
    if (!validation.valid) {
      showError(validation.message);
      clear();
      return;
    }

    selectedFile = file;
    selectedType = validation.type;
    renderPreview(file, selectedType);
  }

  function validate(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const entry = Object.entries(RULES).find(([, rule]) => rule.mimeTypes.includes(file.type))
      || Object.entries(RULES).find(([, rule]) => rule.extensions.includes(extension));

    if (!entry) {
      return { valid: false, message: 'Unsupported file type. Use images, PDFs, documents, audio, mp4, webm, or mov.' };
    }

    const [type, rule] = entry;
    if (file.size > rule.maxBytes) {
      return { valid: false, message: `${rule.label} ${file.name} is ${formatBytes(file.size)}.` };
    }

    return { valid: true, type };
  }

  function renderPreview(file, type) {
    const preview = document.querySelector(currentConfig.preview || '#chatAttachmentPreview');
    if (!preview) return;

    const url = URL.createObjectURL(file);
    const details = `
      <div class="attachment-preview-info">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(formatBytes(file.size))}</span>
      </div>
      <button type="button" class="secondary attachment-remove" id="removeAttachmentBtn">Remove</button>
    `;

    if (type === 'image') {
      preview.innerHTML = `<img src="${url}" alt="">${details}`;
    } else if (type === 'video') {
      preview.innerHTML = `<video src="${url}" controls muted></video>${details}`;
    } else if (type === 'audio') {
      preview.innerHTML = `<audio src="${url}" controls></audio>${details}`;
    } else {
      preview.innerHTML = `<div class="attachment-file-icon">${type === 'pdf' ? 'PDF' : 'FILE'}</div>${details}`;
    }

    preview.hidden = false;
    document.querySelector('#removeAttachmentBtn')?.addEventListener('click', clear);
  }

  async function send(context = {}) {
    if (!selectedFile) return null;
    const file = selectedFile;
    const payloadContext = {
      roomId: context.roomId || context.room,
      receiverId: context.receiverId,
      appointmentId: context.appointmentId || null,
      familyMemberId: context.familyMemberId || localStorage.getItem('activeFamilyMemberId') || null
    };

    if (!payloadContext.roomId || !payloadContext.receiverId) {
      showError('Choose a chat before sending an attachment.');
      return null;
    }

    setUploading(true, 10);
    try {
      const message = await uploadFile(file, { ...context, ...payloadContext });
      clear();
      showSuccess('File sent successfully.');
      return message;
    } catch (error) {
      showError(error.message || 'Could not upload attachment.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file, context = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', context.roomId || context.room || '');
    formData.append('receiverId', context.receiverId || '');
    formData.append('caption', context.caption || '');
    if (context.appointmentId) formData.append('appointmentId', context.appointmentId);
    if (context.familyMemberId) formData.append('familyMemberId', context.familyMemberId);

    setProgress(35, 'Uploading file...');
    const response = await fetch(`${window.API_BASE || localStorage.getItem('API_BASE') || ''}/api/chat/upload-media`, {
      method: 'POST',
      headers: {
        ...(App.token ? { Authorization: `Bearer ${App.token}` } : {})
      },
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Upload failed.');
    setProgress(100, 'File sent');
    return data.chatMessage || data;
  }

  function renderMessageContent(message = {}) {
    const type = message.messageType || (message.fileUrl ? 'file' : 'text');
    if (!message.fileUrl || type === 'text') {
      return `<div>${escapeHtml(message.text || '').replace(/\n/g, '<br>')}</div>`;
    }

    const fileName = escapeHtml(message.fileName || 'Attachment');
    const fileUrl = escapeForAttr(message.fileUrl);
    const openUrl = escapeForAttr(message.fileUrl || '#');
    const messageId = escapeForAttr(message._id || message.id || '');
    const caption = message.text ? `<p>${escapeHtml(message.text)}</p>` : '';

    if (type === 'image') {
      return `
        <button type="button" class="chat-image-attachment" data-attachment-action="preview" data-attachment-type="image" data-attachment-url="${fileUrl}" data-attachment-name="${fileName}">
          <img src="${fileUrl}" alt="${fileName}">
        </button>
        <a class="attachment-download-link" href="${openUrl}" target="_blank" rel="noopener" data-attachment-action="open" data-message-id="${messageId}">Open image</a>
        ${caption}
      `;
    }

    if (type === 'video') {
      return `
        <video class="chat-video-attachment" src="${fileUrl}" controls preload="metadata"></video>
        <button type="button" class="secondary attachment-open-button" data-attachment-action="preview" data-attachment-type="video" data-attachment-url="${fileUrl}" data-attachment-name="${fileName}">Open video</button>
        <a class="attachment-download-link" href="${openUrl}" target="_blank" rel="noopener" data-attachment-action="open" data-message-id="${messageId}">Open in new tab</a>
        ${caption}
      `;
    }

    if (type === 'audio') {
      return ChatVoice?.renderMessageContent
        ? ChatVoice.renderMessageContent(message)
        : `<audio controls src="${fileUrl}"></audio>${caption}`;
    }

    return `
      <a class="chat-file-attachment" href="${openUrl}" target="_blank" rel="noopener" data-attachment-action="open" data-message-id="${messageId}">
        <span class="attachment-file-icon">${type === 'pdf' ? 'PDF' : 'FILE'}</span>
        <span>
          <strong>${fileName}</strong>
          <small>Open or download</small>
        </span>
      </a>
      ${caption}
    `;
  }

  function handleAttachmentClick(event) {
    const previewTrigger = event.target.closest('[data-attachment-action="preview"]');
    if (previewTrigger) {
      const url = previewTrigger.dataset.attachmentUrl || '';
      const type = previewTrigger.dataset.attachmentType || 'image';
      const name = previewTrigger.dataset.attachmentName || 'Attachment';
      if (!url) return;
      openModal(type, url, name);
      return;
    }

    const openTrigger = event.target.closest('[data-attachment-action="open"]');
    if (!openTrigger) return;
    const messageId = openTrigger.dataset.messageId || '';
    if (!messageId) return;
    event.preventDefault();
    openSavedAttachment(messageId, openTrigger.href);
  }

  async function openSavedAttachment(messageId, fallbackUrl = '') {
    const tab = window.open('', '_blank', 'noopener');
    try {
      const response = await fetch(`${window.API_BASE || localStorage.getItem('API_BASE') || ''}/api/messages/${encodeURIComponent(messageId)}/attachment-url`, {
        headers: {
          ...(App.token ? { Authorization: `Bearer ${App.token}` } : {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.fileUrl) throw new Error(data.message || 'Could not open attachment.');
      if (tab) {
        tab.location.href = data.fileUrl;
      } else {
        window.location.href = data.fileUrl;
      }
    } catch (error) {
      if (fallbackUrl) {
        if (tab) {
          tab.location.href = fallbackUrl;
        } else {
          window.location.href = fallbackUrl;
        }
      } else {
        if (tab) tab.close();
        showError(error.message || 'Could not open attachment.');
      }
    }
  }

  function openModal(type, url, fileName = 'Attachment') {
    let modal = document.querySelector('#chatAttachmentModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chatAttachmentModal';
      modal.className = 'attachment-modal';
      modal.innerHTML = `
        <div class="attachment-modal-panel">
          <button type="button" class="attachment-modal-close" onclick="ChatAttachments.closeModal()">Close</button>
          <div id="chatAttachmentModalBody"></div>
        </div>
      `;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
      });
      document.body.appendChild(modal);
    }

    const body = modal.querySelector('#chatAttachmentModalBody');
    body.innerHTML = type === 'video'
      ? `<video src="${escapeForAttr(url)}" controls autoplay></video>`
      : `<img src="${escapeForAttr(url)}" alt="${escapeHtml(fileName)}">`;
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    const modal = document.querySelector('#chatAttachmentModal');
    if (!modal) return;
    modal.hidden = true;
    const video = modal.querySelector('video');
    if (video) video.pause();
    document.body.classList.remove('modal-open');
  }

  function setUploading(isUploading, progress = 0) {
    const form = document.querySelector(currentConfig.form || '.chat-form');
    const status = document.querySelector(currentConfig.progress || '#chatUploadProgress');
    const sendButton = form?.querySelector('button[type="submit"]');
    const attachButton = document.querySelector(currentConfig.attachButton || '#chatAttachmentBtn');
    if (sendButton) sendButton.disabled = isUploading;
    if (attachButton) attachButton.disabled = isUploading;
    if (status) {
      status.hidden = !isUploading;
      setProgress(progress);
    }
  }

  function setProgress(value, label = '') {
    const status = document.querySelector(currentConfig.progress || '#chatUploadProgress');
    if (!status) return;
    status.querySelector('.upload-progress-bar').style.width = `${value}%`;
    status.querySelector('.upload-progress-label').textContent = label || (value >= 100 ? 'Upload complete' : `Uploading ${value}%`);
  }

  function showError(message) {
    const error = document.querySelector(currentConfig.error || '#chatAttachmentError');
    if (error) {
      error.hidden = false;
      error.classList.add('error');
      error.classList.remove('success');
      error.textContent = message;
    } else {
      alert(message);
    }
  }

  function showSuccess(message) {
    const status = document.querySelector(currentConfig.error || '#chatAttachmentError');
    if (!status) return;
    status.hidden = false;
    status.classList.remove('error');
    status.classList.add('success');
    status.textContent = message;
    setTimeout(() => {
      if (status.textContent === message) {
        status.hidden = true;
        status.textContent = '';
        status.classList.remove('success');
      }
    }, 2200);
  }

  function clearError() {
    const error = document.querySelector(currentConfig.error || '#chatAttachmentError');
    if (!error) return;
    error.hidden = true;
    error.textContent = '';
  }

  function clear() {
    selectedFile = null;
    selectedType = '';
    const input = document.querySelector(currentConfig.fileInput || '#chatAttachmentInput');
    const preview = document.querySelector(currentConfig.preview || '#chatAttachmentPreview');
    if (input) input.value = '';
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
  }

  function formatBytes(bytes = 0) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
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

  window.ChatAttachments = {
    init,
    send,
    clear,
    getSelectedFile,
    renderMessageContent,
    openModal,
    closeModal
  };
}());
