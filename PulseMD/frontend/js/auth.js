async function submitAuth(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#authMessage');
  const originalText = button.textContent;

  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  if (payload.confirmPassword && payload.password !== payload.confirmPassword) {
    showAuthMessage(App.translatePhrase('Passwords do not match.'), 'error');
    return;
  }

  delete payload.confirmPassword;
  normalizeAuthPayload(payload);
  payload.preferredLanguage = localStorage.getItem('language') || 'en';

  if (mode === 'signup' && payload.role === 'doctor') {
    if (!payload.specialty?.trim()) {
      showAuthMessage(App.translatePhrase('Please enter your medical specialty.'), 'error');
      return;
    }

    if (payload.consultationFee === '' || Number(payload.consultationFee) < 0) {
      showAuthMessage(App.translatePhrase('Please enter a valid consultation fee.'), 'error');
      return;
    }

    if (!payload.degreeName?.trim() || !payload.registrationNumber?.trim()) {
      showAuthMessage(App.translatePhrase('Please enter your degree name and medical registration number.'), 'error');
      return;
    }

    const isTestDoctor = isTestRegistrationNumber(payload.registrationNumber);
    const degreeCertificate = formData.get('degreeCertificate');
    const registrationCertificate = formData.get('medicalRegistrationCertificate');
    const idProof = formData.get('idProof');

    if (!isTestDoctor && (!degreeCertificate?.name || !registrationCertificate?.name || !idProof?.name)) {
      showAuthMessage(App.translatePhrase('Please upload all three verification documents.'), 'error');
      return;
    }

    delete payload.degreeCertificate;
    delete payload.medicalRegistrationCertificate;
    delete payload.idProof;

    payload.verificationDocuments = {
      degreeCertificate: await fileToVerificationDocument(degreeCertificate),
      medicalRegistrationCertificate: await fileToVerificationDocument(registrationCertificate),
      idProof: await fileToVerificationDocument(idProof)
    };
  }

  button.textContent = mode === 'login'
    ? App.translatePhrase('Signing in...')
    : App.translatePhrase('Creating account...');
  button.disabled = true;

  try {
    const data = await App.request(`/api/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    App.saveSession(data);
    if (mode === 'signup') {
      showAuthMessage(App.translatePhrase(data.message || 'Signup successful. Redirecting...'), 'success');
      setTimeout(() => {
        window.location.href = data.user.role === 'doctor'
          ? '/doctor-dashboard.html'
          : '/patient-dashboard.html';
      }, 700);
      return;
    }

    window.location.href = data.user.role === 'doctor'
      ? '/doctor-dashboard.html'
      : '/patient-dashboard.html';
  } catch (error) {
    showAuthMessage(error.message, 'error');
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function normalizeAuthPayload(payload) {
  if (payload.email) payload.email = payload.email.trim().toLowerCase();
  if (payload.name) payload.name = payload.name.trim();
  if (payload.phone) payload.phone = payload.phone.trim();

  if (payload.dob) {
    const age = calculateAge(payload.dob);
    if (Number.isFinite(age)) payload.age = age;
    delete payload.dob;
  }

  if (payload.fee !== undefined && payload.consultationFee === undefined) {
    payload.consultationFee = payload.fee;
  }

  if (payload.consultationFee !== undefined) {
    payload.consultationFee = Number(payload.consultationFee || 0);
  }

  if (payload.experienceYears !== undefined) {
    payload.experienceYears = Number(payload.experienceYears || 0);
  }
}

function calculateAge(dateValue) {
  const birthDate = new Date(dateValue);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function isTestRegistrationNumber(value = '') {
  return ['TEST12345', 'PENDING123', 'REJECT123'].includes(String(value).trim().toUpperCase());
}

async function fileToVerificationDocument(file) {
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      content: reader.result
    });
    reader.onerror = () => reject(new Error(App.translatePhrase(`Could not read ${file.name}.`)));
    reader.readAsDataURL(file);
  });
}

function toggleDoctorFields() {
  const isDoctor = document.querySelector('#roleSelect')?.value === 'doctor';
  const fields = document.querySelector('#doctorFields');
  const specialty = document.querySelector('#specialtyInput');
  const fee = document.querySelector('#feeInput');
  const degree = document.querySelector('#degreeInput');
  const registration = document.querySelector('#registrationInput');
  const degreeCertificate = document.querySelector('#degreeCertificateInput');
  const registrationCertificate = document.querySelector('#registrationCertificateInput');
  const idProof = document.querySelector('#idProofInput');
  const isTestDoctor = isDoctor && isTestRegistrationNumber(registration?.value);

  if (!fields) return;
  fields.hidden = !isDoctor;
  if (specialty) specialty.required = isDoctor;
  if (fee) fee.required = isDoctor;
  if (degree) degree.required = isDoctor;
  if (registration) registration.required = isDoctor;
  if (degreeCertificate) degreeCertificate.required = isDoctor && !isTestDoctor;
  if (registrationCertificate) registrationCertificate.required = isDoctor && !isTestDoctor;
  if (idProof) idProof.required = isDoctor && !isTestDoctor;
}

function showAuthMessage(text, type) {
  const message = document.querySelector('#authMessage');
  if (!message) {
    alert(text);
    return;
  }

  message.textContent = text;
  message.className = `auth-message ${type}`;
}

function togglePassword(inputId, button) {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  if (button) button.textContent = isHidden
    ? App.translatePhrase('Hide password')
    : App.translatePhrase('Show password');
}

function showForgotPassword(event) {
  event?.preventDefault();
  setLoginAuthMode('forgot');
}

function hideForgotPassword() {
  setLoginAuthMode('login');
}

function setLoginAuthMode(mode) {
  const showForgot = mode === 'forgot';
  const loginForm = document.querySelector('#loginFormSection');
  const loginTabs = document.querySelector('#loginTabsSection');
  const forgotForm = document.querySelector('#resetPasswordSection');
  const authMessage = document.querySelector('#authMessage');
  const forgotMessage = document.querySelector('#forgotPasswordMessage');

  if (!loginForm || !forgotForm) return;

  [loginForm, loginTabs].forEach((section) => {
    if (!section) return;
    section.hidden = showForgot;
    section.classList.toggle('is-auth-hidden', showForgot);
    section.style.display = showForgot ? 'none' : '';
    section.setAttribute('aria-hidden', String(showForgot));
  });

  forgotForm.hidden = !showForgot;
  forgotForm.classList.toggle('is-auth-hidden', !showForgot);
  forgotForm.style.display = showForgot ? '' : 'none';
  forgotForm.setAttribute('aria-hidden', String(!showForgot));

  if (authMessage) {
    authMessage.textContent = '';
    authMessage.className = 'auth-message';
  }

  if (forgotMessage) {
    forgotMessage.textContent = '';
    forgotMessage.className = 'auth-message';
  }

  if (showForgot) {
    forgotForm.querySelector('input[name="email"]')?.focus();
  } else {
    loginForm.querySelector('input[name="email"]')?.focus();
  }
}

async function submitForgotPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#forgotPasswordMessage');
  const originalText = button.textContent;
  if (message) {
    message.textContent = '';
    message.className = 'auth-message';
  }

  button.disabled = true;
  button.textContent = App.translatePhrase('Sending...');
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const data = await App.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (message) {
      message.textContent = App.translatePhrase(data.message || 'Reset link generated.');
      message.className = 'auth-message success';
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message;
      message.className = 'auth-message error';
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function submitResetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#resetPasswordMessage');
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  const payload = Object.fromEntries(new FormData(form).entries());

  if (payload.password !== payload.confirmPassword) {
    if (message) {
      message.textContent = App.translatePhrase('Passwords do not match.');
      message.className = 'auth-message error';
    }
    return;
  }

  delete payload.confirmPassword;
  button.disabled = true;
  button.textContent = App.translatePhrase('Updating...');
  try {
    const data = await App.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (message) {
      message.textContent = App.translatePhrase(data.message || 'Password updated.');
      message.className = 'auth-message success';
    }
    setTimeout(() => { window.location.href = '/login.html'; }, 1000);
  } catch (error) {
    if (message) {
      message.textContent = error.message;
      message.className = 'auth-message error';
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  App.initTheme();
  toggleDoctorFields();
  if (document.querySelector('#loginFormSection') && document.querySelector('#resetPasswordSection')) {
    setLoginAuthMode('login');
  }
  const resetTokenInput = document.querySelector('#resetTokenInput');
  if (resetTokenInput) {
    resetTokenInput.value = new URLSearchParams(window.location.search).get('token') || '';
  }
});
document.addEventListener('input', (event) => {
  if (event.target?.id === 'registrationInput') toggleDoctorFields();
});
