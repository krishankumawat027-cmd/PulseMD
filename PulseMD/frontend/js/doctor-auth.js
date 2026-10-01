async function fileToVerificationDocument(file) {
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: reader.result
    });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function buildDoctorAuthPayload(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const languages = formData.getAll('languages');

  delete payload.degreeCertificate;
  delete payload.medicalRegistrationCertificate;
  delete payload.idProof;
  delete payload.languages;

  payload.verificationDocuments = {
    degreeCertificate: await fileToVerificationDocument(formData.get('degreeCertificate')),
    medicalRegistrationCertificate: await fileToVerificationDocument(formData.get('medicalRegistrationCertificate')),
    idProof: await fileToVerificationDocument(formData.get('idProof'))
  };

  if (languages.length) {
    payload.bio = [payload.bio, `Languages: ${languages.join(', ')}`].filter(Boolean).join('\n');
  }

  const profileBits = [payload.city, payload.clinic].filter(Boolean).join(' | ');
  if (profileBits) {
    payload.bio = [payload.bio, profileBits].filter(Boolean).join('\n');
  }

  normalizeDoctorAuthPayload(payload);
  return payload;
}

function normalizeDoctorAuthPayload(payload) {
  payload.role = 'doctor';
  if (payload.email) payload.email = payload.email.trim().toLowerCase();
  if (payload.name) payload.name = payload.name.trim();
  if (payload.phone) payload.phone = payload.phone.trim();
  if (payload.specialty && !payload.specialization) payload.specialization = payload.specialty;
  if (payload.fee !== undefined && payload.consultationFee === undefined) {
    payload.consultationFee = Number(payload.fee || 0);
  }
  if (payload.fee !== undefined) payload.fee = Number(payload.fee || 0);
  if (payload.experienceYears !== undefined) {
    payload.experienceYears = Number(payload.experienceYears || 0);
  }
}

function isTestRegistrationNumber(value = '') {
  return ['TEST12345', 'PENDING123', 'REJECT123'].includes(String(value).trim().toUpperCase());
}

function updateDoctorDocumentRequirements() {
  const registration = document.querySelector('[name="registrationNumber"]');
  const isTestDoctor = isTestRegistrationNumber(registration?.value);

  document.querySelectorAll('[name="degreeCertificate"], [name="medicalRegistrationCertificate"], [name="idProof"]')
    .forEach((input) => {
      input.required = !isTestDoctor;
    });
}

async function submitDoctorAuth(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = mode === 'login'
    ? App.translatePhrase('Signing in...')
    : App.translatePhrase('Creating doctor...');
  showDoctorAuthMessage('', '');

  try {
    const payload = mode === 'signup'
      ? await buildDoctorAuthPayload(form)
      : Object.fromEntries(new FormData(form).entries());
    payload.preferredLanguage = localStorage.getItem('language') || 'en';

    const data = await App.request(`/api/doctor/${mode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    App.saveSession(data);
    if (mode === 'signup') {
      showDoctorAuthMessage(App.translatePhrase(data.message || 'Doctor account created. Redirecting...'), 'success');
    }
    window.location.href = '/doctor-dashboard.html';
  } catch (error) {
    showDoctorAuthMessage(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function showDoctorAuthMessage(text, type) {
  let message = document.querySelector('#doctorAuthMessage');
  if (!message) {
    const form = document.querySelector('.care-auth-form');
    const submit = form?.querySelector('button[type="submit"]');
    if (form && submit) {
      submit.insertAdjacentHTML('beforebegin', '<p id="doctorAuthMessage" class="auth-message" role="status" aria-live="polite"></p>');
      message = document.querySelector('#doctorAuthMessage');
    }
  }

  if (!message) {
    alert(text);
    return;
  }

  message.textContent = text;
  message.className = `auth-message ${type}`;
}

document.addEventListener('DOMContentLoaded', updateDoctorDocumentRequirements);
document.addEventListener('input', (event) => {
  if (event.target?.name === 'registrationNumber') updateDoctorDocumentRequirements();
});
