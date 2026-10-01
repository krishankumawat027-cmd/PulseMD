async function initPatientProfile() {
  App.mountPatientNav('profile');
  const user = App.requireAuth();
  if (!user) return;
  $('#profileName').textContent = user.name;
  $('#profileEmail').textContent = user.email;
  if ($('#profilePhone')) $('#profilePhone').textContent = user.phone || 'Phone not added';
  if ($('#profileNameInput')) $('#profileNameInput').value = user.name || '';
  if ($('#profileEmailInput')) $('#profileEmailInput').value = user.email || '';
  if ($('#profilePhoneInput')) $('#profilePhoneInput').value = user.phone || '';
  if ($('#profileLanguageMount')) {
    $('#profileLanguageMount').innerHTML = App.languageSelect();
    App.applyLanguage();
  }

  try {
    const profile = await App.request('/api/patient/profile');
    if ($('#profileNotesInput')) $('#profileNotesInput').value = profile?.medicalNotes || '';
    renderEmergencyContact(profile?.emergencyContact);
  } catch (error) {
    renderEmergencyContact(null);
  }

  await loadWearableSettings();
}

window.renderProfileI18n = async () => {
  await App.applyLanguage();
  await loadWearableSettings();
  renderEmergencyContact(App.patientEmergencyContact);
};

const wearableProviders = [
  {
    id: 'apple_health',
    name: 'Apple Health / Apple Watch',
    device: 'Apple Health / Apple Watch',
    note: 'Requires HealthKit through the iOS app or native companion layer.'
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    device: 'Google Health / Fitbit',
    note: 'Uses the Google Health API architecture for Fitbit data.'
  },
  {
    id: 'samsung_health',
    name: 'Samsung Health',
    device: 'Samsung Health via Health Connect',
    note: 'Uses Android Health Connect as the primary integration layer.'
  },
  {
    id: 'garmin',
    name: 'Garmin',
    device: 'Garmin Connect',
    note: 'Connects through Garmin provider adapter.'
  },
  {
    id: 'withings',
    name: 'Withings',
    device: 'Withings',
    note: 'Connects through Withings provider adapter.'
  }
];

const wearablePermissions = [
  'steps',
  'heart_rate',
  'resting_heart_rate',
  'sleep',
  'calories',
  'oxygen_saturation',
  'blood_pressure',
  'workouts'
];

async function loadWearableSettings() {
  const list = $('#wearableProviderList');
  if (!list) return;
  try {
    const data = await App.request('/api/wearables/status');
    const connections = new Map((data.connections || []).map((item) => [item.provider, item]));
    list.innerHTML = wearableProviders.map((provider) => wearableProviderCard(provider, connections.get(provider.id))).join('');
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
  }
}

function wearableProviderCard(provider, connection = null) {
  const connected = connection?.syncStatus === 'CONNECTED' || connection?.syncStatus === 'SYNCING';
  const status = connection?.syncStatus || 'DISCONNECTED';
  const lastSynced = connection?.lastSyncedAt ? formatDateTime(connection.lastSyncedAt) : App.translatePhrase('No recent data');
  return `
    <article class="wearable-provider-card">
      <div>
        <span class="status-pill ${connected ? 'active' : 'pending'}">${escapeHtml(status.replace('_', ' '))}</span>
        <h3>${escapeHtml(provider.name)}</h3>
        <p class="muted">${escapeHtml(provider.note)}</p>
      </div>
      <div class="wearable-meta">
        <span><strong>${escapeHtml(App.translatePhrase('Data source:'))}</strong> ${escapeHtml(connection?.sourceDevice || provider.device)}</span>
        <span><strong>${escapeHtml(App.translatePhrase('Last synced:'))}</strong> ${escapeHtml(lastSynced)}</span>
      </div>
      <div class="actions">
        ${connected
          ? `<button type="button" class="secondary" onclick="syncWearableProvider('${provider.id}')">${escapeHtml(App.translatePhrase('Sync now'))}</button>
             <button type="button" class="danger" onclick="disconnectWearableProvider('${provider.id}')">${escapeHtml(App.translatePhrase('Disconnect'))}</button>`
          : `<button type="button" onclick="connectWearableProvider('${provider.id}')">${escapeHtml(App.translatePhrase('Connect'))}</button>`}
      </div>
    </article>
  `;
}

async function connectWearableProvider(provider) {
  const status = $('#wearableSettingsStatus');
  if (!window.confirm('I consent to securely sync selected wearable health data with PulseMD - Virtual Clinic.')) return;
  setWearableStatus('Connecting wearable...', false);
  try {
    await App.request(`/api/wearables/connect/${provider}`, {
      method: 'POST',
      body: JSON.stringify({
        consentAccepted: true,
        permissions: wearablePermissions,
        sourceDevice: wearableProviders.find((item) => item.id === provider)?.device || provider
      })
    });
    await App.request(`/api/wearables/sync/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ mock: true })
    });
    if (status) status.textContent = 'Connection active. Health data synced securely.';
    await loadWearableSettings();
  } catch (error) {
    setWearableStatus(error.message, true);
  }
}

async function syncWearableProvider(provider) {
  setWearableStatus('Syncing health data securely...', false);
  try {
    const result = await App.request(`/api/wearables/sync/${provider}`, {
      method: 'POST',
      body: JSON.stringify({ mock: true })
    });
    setWearableStatus(`Last synced. ${result.recordsSaved || 0} records saved.`, false);
    await loadWearableSettings();
  } catch (error) {
    setWearableStatus(error.message, true);
  }
}

async function disconnectWearableProvider(provider) {
  setWearableStatus('Disconnecting wearable...', false);
  try {
    await App.request(`/api/wearables/disconnect/${provider}`, { method: 'POST' });
    setWearableStatus('Wearable disconnected.', false);
    await loadWearableSettings();
  } catch (error) {
    setWearableStatus(error.message, true);
  }
}

function setWearableStatus(message, isError) {
  const status = $('#wearableSettingsStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

function normalizeProfileEmergencyContact(contact) {
  if (!contact) return { name: '', phone: '' };
  if (typeof contact === 'string') return { name: '', phone: contact };
  return {
    name: contact.name || '',
    phone: contact.phone || ''
  };
}

function renderEmergencyContact(contact) {
  const normalized = normalizeProfileEmergencyContact(contact);
  const nameInput = $('#emergencyContactNameInput');
  const phoneInput = $('#emergencyContactPhoneInput');
  const saved = $('#savedEmergencyContact');
  const callNow = $('#emergencyCallNow');

  if (nameInput) nameInput.value = normalized.name;
  if (phoneInput) phoneInput.value = normalized.phone;

  if (saved) {
    saved.innerHTML = normalized.phone
      ? `<strong>${escapeHtml(normalized.name || App.translatePhrase('Emergency contact'))}</strong><span>${escapeHtml(normalized.phone)}</span>`
      : App.translatePhrase('No emergency contact saved yet.');
  }

  if (callNow) {
    callNow.hidden = !normalized.phone;
    callNow.href = normalized.phone ? `tel:${normalized.phone}` : '#';
  }

  App.patientEmergencyContact = normalized.phone ? normalized : null;
}

async function savePatientProfile(event) {
  event.preventDefault();
  const message = $('#profileSaveMessage');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const originalText = button?.textContent || App.translatePhrase('Save profile');
  const payload = {
    name: $('#profileNameInput')?.value || '',
    email: $('#profileEmailInput')?.value || '',
    phone: $('#profilePhoneInput')?.value || '',
    medicalNotes: $('#profileNotesInput')?.value || ''
  };

  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  if (button) {
    button.disabled = true;
    button.textContent = App.translatePhrase('Saving...');
  }

  try {
    const data = await App.request('/api/patient/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    const nextUser = {
      ...(App.user || {}),
      ...(data.user || {}),
      role: App.user?.role || 'patient'
    };
    localStorage.setItem('user', JSON.stringify(nextUser));
    $('#profileName').textContent = nextUser.name || '';
    $('#profileEmail').textContent = nextUser.email || '';
    if ($('#profilePhone')) $('#profilePhone').textContent = nextUser.phone || App.translatePhrase('Phone not added');

    if (message) {
      message.textContent = App.translatePhrase(data.message || 'Profile updated successfully.');
      message.className = 'auth-message success';
    }

    if (typeof App.updateAllText === 'function') await App.updateAllText();
  } catch (error) {
    if (message) {
      message.textContent = App.translatePhrase(error.message);
      message.className = 'auth-message error';
    } else {
      alert(error.message);
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function saveEmergencyContact(event) {
  event.preventDefault();
  const message = $('#emergencyContactMessage');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const originalText = button?.textContent || 'Save emergency contact';
  const payload = {
    name: $('#emergencyContactNameInput')?.value || '',
    phone: $('#emergencyContactPhoneInput')?.value || ''
  };

  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Saving...';
  }

  try {
    const data = await App.request('/api/emergency/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    renderEmergencyContact(data.emergencyContact);
    if (message) {
      message.textContent = data.message || 'Emergency contact saved.';
      message.className = 'auth-message success';
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message;
      message.className = 'auth-message error';
    } else {
      alert(error.message);
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}
