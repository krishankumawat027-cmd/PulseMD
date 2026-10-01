let paymentAppointment;

async function initPaymentPage() {
  App.mountPatientNav('payments');
  App.requireAuth();
  await App.initI18n();
  setupPaymentMethodCards();
  await loadPaymentTarget();
  await loadPaymentHistory();
}

function setupPaymentMethodCards() {
  document.querySelectorAll('.payment-method-card').forEach((card) => {
    card.addEventListener('click', () => {
      const input = card.querySelector('input[type="radio"]');
      if (input) input.checked = true;
      document.querySelectorAll('.payment-method-card').forEach((item) => {
        item.classList.toggle('selected', item === card);
      });
    });
  });
}

async function loadPaymentTarget() {
  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get('appointmentId') || localStorage.getItem('activeAppointmentId');
  if (!appointmentId) {
    $('#paymentDetails').innerHTML = `<p class="muted">${App.t('payments.openFromPending')}</p>`;
    return;
  }

  try {
    paymentAppointment = await App.request(`/api/payment/appointment/${appointmentId}`);
  } catch (error) {
    $('#paymentDetails').innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
    $('#payNowBtn').disabled = true;
    return;
  }
  const specialty = paymentAppointment.doctor?.specialty || App.t('labels.onlineConsultation');
  $('#paymentDetails').innerHTML = `
    <p><strong>${App.t('labels.doctor')}:</strong> ${escapeHtml(paymentAppointment.doctor?.name || App.t('labels.doctor'))}</p>
    <p><strong>${App.t('labels.specialty')}:</strong> ${escapeHtml(specialty)}</p>
    <p><strong>${App.t('labels.patient')}:</strong> ${escapeHtml(paymentAppointment.patient?.name || App.user?.name || App.t('labels.patient'))}</p>
    <p><strong>${App.t('labels.appointment')}:</strong> ${formatDateTime(paymentAppointment.scheduledAt)}</p>
    <div class="advice-box">
      <p><strong>${App.t('labels.consultationFee')}:</strong> ${formatMoney(paymentAppointment.consultationFee)}</p>
      <p><strong>${App.t('labels.platformFee')}:</strong> ${formatMoney(0)}</p>
      <p><strong>${App.t('labels.total')}:</strong> ${formatMoney(paymentAppointment.consultationFee)}</p>
    </div>
    <p><span class="status-pill ${paymentAppointment.paymentStatus}">${App.tStatus(paymentAppointment.paymentStatus)}</span></p>
  `;
  $('#payNowBtn').disabled = paymentAppointment.paymentStatus === 'paid';
  $('#payNowBtn').textContent = paymentAppointment.paymentStatus === 'paid' ? App.t('status.paid') : App.t('buttons.payNow');
}

async function payNow() {
  if (!paymentAppointment) return;

  const button = $('#payNowBtn');
  button.disabled = true;
  button.textContent = App.t('payments.creatingOrder');
  $('#paymentStatus').textContent = App.t('payments.openingCheckout');

  try {
    const data = await App.request('/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ appointmentId: paymentAppointment._id })
    });

    const options = {
      key: data.keyId,
      amount: data.order.amount,
      currency: data.order.currency,
      name: 'PulseMD - Virtual Clinic',
      description: `${App.t('payments.consultationWith')} ${paymentAppointment.doctor?.name || App.t('labels.doctor')}`,
      order_id: data.order.id,
      prefill: {
        name: paymentAppointment.patient?.name || App.user?.name || '',
        email: paymentAppointment.patient?.email || App.user?.email || ''
      },
      notes: {
        appointmentId: paymentAppointment._id
      },
      theme: {
        color: '#0f8f83'
      },
      handler: async (response) => {
        await verifyPayment(response);
      },
      modal: {
        ondismiss: () => {
          button.disabled = false;
          button.textContent = App.t('buttons.payNow');
          $('#paymentStatus').innerHTML = `<span class="status-pill failed">${App.tStatus('cancelled')}</span> ${App.t('payments.tryWhenReady')}`;
        }
      }
    };

    const checkout = new Razorpay(options);
    checkout.on('payment.failed', (response) => {
      button.disabled = false;
      button.textContent = App.t('buttons.payNow');
      $('#paymentStatus').innerHTML = `<span class="status-pill failed">${App.tStatus('failed')}</span> ${escapeHtml(response.error?.description || App.t('alerts.tryAgain'))}`;
    });
    checkout.open();
  } catch (error) {
    button.disabled = false;
    button.textContent = App.t('buttons.payNow');
    $('#paymentStatus').innerHTML = `<span class="status-pill failed">${App.tStatus('failed')}</span> ${escapeHtml(error.message)}`;
  }
}

async function verifyPayment(response) {
  $('#paymentStatus').textContent = App.t('payments.verifying');

  const result = await App.request('/api/payment/verify-payment', {
    method: 'POST',
    body: JSON.stringify({
      appointmentId: paymentAppointment._id,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    })
  });

  localStorage.setItem('activeAppointmentId', result.appointment._id);
  localStorage.setItem('doctorRoom', result.appointment.doctor._id || result.appointment.doctor);
  $('#paymentStatus').innerHTML = `<span class="status-pill paid">${App.t('payments.success')}</span> ${App.t('payments.unlocked')}`;
  $('#payNowBtn').textContent = App.t('status.paid');
  $('#payNowBtn').disabled = true;
  paymentAppointment = result.appointment;
  await loadPaymentHistory();
}

async function loadPaymentHistory() {
  const payments = await App.request('/api/patient/payments');
  $('#paymentsBody').innerHTML = payments.length
    ? payments.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.doctorId?.name || App.t('labels.doctor'))}</td>
        <td>${formatMoney(payment.amount)}</td>
        <td><span class="status-pill ${payment.status || payment.paymentStatus}">${App.tStatus(payment.status || payment.paymentStatus)}</span></td>
        <td>${formatDateTime(payment.paymentDate || payment.createdAt)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4">${App.t('empty.noPayments')}</td></tr>`;
}

window.renderPaymentsI18n = async () => {
  if (document.querySelector('#paymentDetails')) await loadPaymentTarget();
  if (document.querySelector('#paymentsBody')) await loadPaymentHistory();
};
