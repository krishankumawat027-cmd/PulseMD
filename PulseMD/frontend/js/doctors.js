let availableDoctors = [];
let selectedDoctor = null;
let bookingFamilyMembers = [];

async function loadDoctors() {
  App.mountPatientNav('doctors');
  App.requireAuth();
  await App.initI18n();
  const list = $('#doctorList');
  list.innerHTML = `<p class="muted">Loading doctors...</p>`;

  try {
    await loadBookingFamilyMembers();
    const data = await App.request('/api/doctors');
    availableDoctors = (Array.isArray(data) ? data : [])
      .filter(Boolean)
      .filter((doctor) => doctor.user?._id || doctor.user || doctor._id);

    if (!availableDoctors.length) {
      list.innerHTML = '<p class="muted">No doctors available</p>';
      return;
    }

    const specialties = [...new Set(availableDoctors.map((doctor) => doctor.specialization).filter(Boolean))];
    $('#specialtyFilter').innerHTML = `<option value="">${App.t('labels.allSpecialties')}</option>` + specialties
      .map((specialty) => `<option value="${escapeForAttr(specialty)}">${escapeHtml(specialty)}</option>`)
      .join('');

    const params = new URLSearchParams(window.location.search);
    const suggestedSpecialty = params.get('specialty') || localStorage.getItem('suggestedSpecialty') || '';
    if (suggestedSpecialty && $('#specialtyFilter')) {
      const match = specialties.find((item) => item.toLowerCase().includes(suggestedSpecialty.toLowerCase()) || suggestedSpecialty.toLowerCase().includes(item.toLowerCase()));
      $('#specialtyFilter').value = match || '';
      if (!match && $('#doctorSearch')) $('#doctorSearch').value = suggestedSpecialty;
    }
    if (params.get('symptomHistoryId')) {
      localStorage.setItem('suggestedSymptomHistoryId', params.get('symptomHistoryId'));
    }

    renderDoctors();
  } catch (error) {
    list.innerHTML = `<p class="status-line error">${error.message}</p>`;
  }
}

function renderDoctors() {
  const list = $('#doctorList');
  const specialty = $('#specialtyFilter')?.value || '';
  const search = ($('#doctorSearch')?.value || '').trim().toLowerCase();
  const city = $('#cityFilter')?.value || '';
  const sort = $('#doctorSort')?.value || 'recommended';
  let doctors = specialty
    ? availableDoctors.filter((doctor) => (doctor.specialization || '') === specialty)
    : availableDoctors;

  doctors = doctors.filter((doctor, index) => {
    const mock = mockDoctorDetails(doctor, index);
    const haystack = [
      doctor.name,
      doctor.user?.name,
      doctor.specialization || 'General Medicine',
      doctor.bio || '',
      mock.city,
      mock.clinic
    ].join(' ').toLowerCase();
    return (!search || haystack.includes(search)) && (!city || mock.city === city);
  });

  doctors = [...doctors].sort((a, b) => {
    if (sort === 'fee-low') return Number(a.fee || 0) - Number(b.fee || 0);
    if (sort === 'rating') return mockDoctorDetails(b, availableDoctors.indexOf(b)).rating - mockDoctorDetails(a, availableDoctors.indexOf(a)).rating;
    return 0;
  });

  if (!doctors.length) {
    list.innerHTML = `<p class="muted">${App.t('empty.noMatchingDoctors')}</p>`;
    return;
  }

  list.innerHTML = doctors.map((doctor) => {
    const mock = mockDoctorDetails(doctor, availableDoctors.indexOf(doctor));
    const doctorId = doctor.user?._id || doctor.user || doctor._id;
    const doctorName = doctor.name || doctor.user?.name || 'Doctor';
    const isVerified = Boolean(doctor.canBook || doctor.isVerified || ['verified', 'Verified'].includes(doctor.verificationStatus));
    const avatar = `<div class="avatar avatar-fallback doctor-illustration" data-initials="👨‍⚕️">👨‍⚕️</div>`;

    const availabilityLabel = doctor.availability?.label || 'Availability not set';
    const availabilityClass = doctor.availability?.code === 'available_now'
      ? 'online'
      : doctor.availability?.code === 'next_available'
        ? 'pending'
        : 'offline';
    const slotSummary = buildSlotSummary(doctor.availabilitySchedule);

    return `
      <article class="doctor-card premium-doctor-card">
        <div class="doctor-card-header">
          ${avatar}
          <div>
            <h3>Dr. ${escapeHtml(doctorName)}</h3>
            <p class="muted">${escapeHtml(doctor.specialization || 'General Medicine')}</p>
            <div class="doctor-badge-row">
              <span class="status-pill ${isVerified ? 'verified' : 'pending'}">${escapeHtml(isVerified ? App.t('status.verified') : 'Verification pending')}</span>
              <span class="status-pill ${availabilityClass}">${escapeHtml(availabilityLabel)}</span>
            </div>
          </div>
        </div>
        <p class="doctor-summary">${escapeHtml(doctor.bio || 'Available for online consultation with follow-up guidance.')}</p>
        <div class="doctor-meta">
          <span><strong>${mock.rating.toFixed(1)}</strong> ${App.t('labels.rating')}</span>
          <span><strong>${mock.reviews}</strong> ${App.t('labels.reviews')}</span>
          <span><strong>${mock.experience}</strong> ${App.t('labels.yearsExperience')}</span>
          <span>${escapeHtml(mock.city)}</span>
          <span>${escapeHtml(mock.clinic)}</span>
          <span class="doctor-slot-chip">${App.t('labels.active')}: ${escapeHtml(slotSummary)}</span>
        </div>
        <div class="doctor-price-row">
          <div>
            <small>${App.t('labels.consultationFee')}</small>
            <strong>${formatMoney(doctor.fee)}</strong>
          </div>
          <span class="status-pill active">${App.t('labels.securePay')}</span>
        </div>
        <div class="actions">
          <button class="secondary" onclick="selectDoctor('${doctorId}', 'chat')" ${isVerified ? '' : 'disabled title="Doctor verification is pending"'}>${App.t('buttons.chat')}</button>
          <button onclick="openBooking('${doctorId}')" ${isVerified ? '' : 'disabled title="Doctor verification is pending"'}>${App.t('buttons.bookAppointment')}</button>
        </div>
      </article>
    `;
  }).join('');
}

function mockDoctorDetails(doctor, index = 0) {
  const cities = ['Mumbai', 'Delhi', 'Pune', 'Ahmedabad', 'Bangalore'];
  const clinics = ['Apollo Clinic', 'Fortis Health Hub', 'Sahyadri Family Care', 'Sterling Care Centre', 'Manipal Digital OPD'];
  const seed = Math.max(0, index);
  return {
    city: doctor?.city || cities[seed % cities.length],
    clinic: doctor?.clinic || clinics[seed % clinics.length],
    rating: 4.6 + ((seed % 4) * 0.1),
    reviews: 420 + (seed * 137),
    experience: doctor.experienceYears || (6 + (seed % 12))
  };
}

function selectDoctor(doctorId, action) {
  const doctor = availableDoctors.find((item) => (item.user?._id || item.user || item._id) === doctorId);
  if (!doctor?.canBook && !doctor?.isVerified && !['verified', 'Verified'].includes(doctor?.verificationStatus)) {
    alert('Doctor verification is pending. Please choose a verified doctor.');
    return;
  }
  if (action === 'chat') {
    openBooking(doctorId);
    const message = $('#bookingMessage');
    if (message) {
      message.textContent = App.translatePhrase('Book and pay first to unlock secure chat with this doctor.');
      message.classList.remove('error');
    }
    return;
  }
  localStorage.setItem('doctorRoom', doctorId);
  if (doctor) localStorage.setItem('activeDoctor', JSON.stringify(doctor));
  const memberId = $('#bookingFamilyMember')?.value || new URLSearchParams(window.location.search).get('familyMemberId') || localStorage.getItem('activeFamilyMemberId') || '';
  if (memberId) localStorage.setItem('activeFamilyMemberId', memberId);

  window.location.href = action === 'chat' ? '/chat.html' : '/video.html';
}

function openBooking(doctorId) {
  selectedDoctor = availableDoctors.find((doctor) => (doctor.user?._id || doctor.user || doctor._id) === doctorId);
  if (!selectedDoctor) return;
  if (!selectedDoctor.canBook && !selectedDoctor.isVerified && !['verified', 'Verified'].includes(selectedDoctor.verificationStatus)) {
    alert('Doctor verification is pending. Please choose a verified doctor.');
    return;
  }

  localStorage.setItem('doctorRoom', doctorId);
  localStorage.setItem('activeDoctor', JSON.stringify(selectedDoctor));
  $('#doctorId').value = doctorId;
  populateBookingFamilyMemberSelect();
  $('#bookingDoctor').textContent = `${App.t('labels.appointmentWith')} ${App.t('labels.dr')} ${selectedDoctor.name || selectedDoctor.user?.name || 'Doctor'}`;
  $('#bookingFee').textContent = formatMoney(selectedDoctor.fee);
  if ($('#bookingActiveTime')) {
    $('#bookingActiveTime').textContent = buildSlotSummary(selectedDoctor.availabilitySchedule);
  }
  if ($('#bookingAvailability')) {
    $('#bookingAvailability').textContent = selectedDoctor.availability?.label || '';
  }
  $('#bookingPanel').hidden = false;
  $('#bookingPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeBooking() {
  $('#bookingPanel').hidden = true;
}

async function bookAppointment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#bookingMessage');
  message.textContent = App.t('alerts.sendingRequest');
  message.classList.remove('error');

  try {
    const appointment = await App.request('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        ...Object.fromEntries(new FormData(form).entries()),
        symptomHistoryId: localStorage.getItem('suggestedSymptomHistoryId') || ''
      })
    });
    localStorage.removeItem('suggestedSymptomHistoryId');
    localStorage.removeItem('suggestedSpecialty');
    if (appointment.familyMemberId?._id || appointment.familyMemberId) {
      localStorage.setItem('activeFamilyMemberId', appointment.familyMemberId._id || appointment.familyMemberId);
      localStorage.setItem('activeFamilyMemberName', appointment.familyMemberId.fullName || '');
    }
    localStorage.setItem('activeAppointmentId', appointment._id);
    message.textContent = appointment.paymentStatus === 'pending'
      ? App.t('alerts.appointmentCreatedPay')
      : App.t('alerts.appointmentRequestSent');
    form.reset();
    setTimeout(() => {
      window.location.href = appointment.paymentStatus === 'pending'
        ? `/payment.html?appointmentId=${appointment._id}`
        : '/appointments.html';
    }, 700);
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function loadBookingFamilyMembers() {
  try {
    bookingFamilyMembers = await App.request('/api/family-members');
    populateBookingFamilyMemberSelect();
  } catch (error) {
    bookingFamilyMembers = [];
  }
}

function populateBookingFamilyMemberSelect() {
  const select = $('#bookingFamilyMember');
  if (!select) return;
  const current = new URLSearchParams(window.location.search).get('familyMemberId') || localStorage.getItem('activeFamilyMemberId') || select.value || '';
  select.innerHTML = '<option value="">Self / account owner</option>' + bookingFamilyMembers
    .map((member) => `<option value="${escapeForAttr(member._id)}">${escapeHtml(member.fullName)} (${escapeHtml(member.relation)})</option>`)
    .join('');
  select.value = bookingFamilyMembers.some((member) => String(member._id) === String(current)) ? current : '';
  select.onchange = () => {
    const member = bookingFamilyMembers.find((item) => String(item._id) === String(select.value));
    if (member) {
      localStorage.setItem('activeFamilyMemberId', member._id);
      localStorage.setItem('activeFamilyMemberName', member.fullName);
    } else {
      localStorage.removeItem('activeFamilyMemberId');
      localStorage.removeItem('activeFamilyMemberName');
    }
  };
}

window.renderDoctorsI18n = async () => {
  if (availableDoctors.length) {
    const specialties = [...new Set(availableDoctors.map((doctor) => doctor.specialization).filter(Boolean))];
    const current = $('#specialtyFilter')?.value || '';
    if ($('#specialtyFilter')) {
      $('#specialtyFilter').innerHTML = `<option value="">${App.t('labels.allSpecialties')}</option>` + specialties
        .map((specialty) => `<option value="${escapeForAttr(specialty)}">${escapeHtml(specialty)}</option>`)
        .join('');
      $('#specialtyFilter').value = current;
    }
    renderDoctors();
  }
};

function escapeForAttr(value) {
  return String(value || '').replace(/'/g, '&#039;').replace(/"/g, '&quot;');
}

function buildSlotSummary(schedule = {}) {
  const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days.join(', ') : 'Mon, Tue, Wed, Thu, Fri';
  const slots = Array.isArray(schedule.slots) && schedule.slots.length
    ? schedule.slots.map((slot) => `${slot.startTime}-${slot.endTime}`).join(' | ')
    : '10:00-13:00 | 17:00-20:00';
  return `${days} | ${slots} (IST)`;
}
