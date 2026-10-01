const Appointment = require('../models/Appointment');
const DoctorEarning = require('../models/DoctorEarning');
const Payment = require('../models/Payment');

function asObjectIdString(value) {
  if (!value) return '';
  return String(value._id || value);
}

function asNumber(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isSuccessfulPaymentStatus(value) {
  return ['paid', 'success', 'completed'].includes(normalizeStatus(value));
}

function isPendingPaymentStatus(value) {
  return ['created', 'pending'].includes(normalizeStatus(value));
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAppointmentPaymentQuery(appointmentId, doctorId) {
  return {
    appointmentId,
    doctorId
  };
}

function getCompletedStatus(appointment = {}) {
  return String(appointment.consultationStatus || appointment.status || '').toLowerCase();
}

function isCompletedAppointment(appointment = {}) {
  return getCompletedStatus(appointment) === 'completed';
}

function isPaidAppointment(appointment = {}, payment = null) {
  const appointmentPaymentStatus = String(appointment.paymentStatus || '').toLowerCase();
  const paymentStatus = String(payment?.paymentStatus || payment?.status || '').toLowerCase();
  return appointmentPaymentStatus === 'paid' || paymentStatus === 'paid';
}

function isRefundedAppointment(appointment = {}, payment = null) {
  const appointmentPaymentStatus = String(appointment.paymentStatus || '').toLowerCase();
  const paymentStatus = String(payment?.paymentStatus || payment?.status || '').toLowerCase();
  return appointmentPaymentStatus === 'refunded' || paymentStatus === 'refunded';
}

function getRangeFromQuery(query = {}) {
  const from = normalizeDate(query.from);
  const to = normalizeDate(query.to);
  const range = {};

  if (from) {
    from.setHours(0, 0, 0, 0);
    range.$gte = from;
  }

  if (to) {
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }

  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    const swap = range.$gte;
    range.$gte = range.$lte;
    range.$lte = swap;
  }

  return range;
}

function isDateInRange(date, range = {}) {
  const normalized = normalizeDate(date);
  if (!normalized) return false;
  if (range.$gte && normalized < range.$gte) return false;
  if (range.$lte && normalized > range.$lte) return false;
  return true;
}

function sumAmounts(items = []) {
  return items.reduce((sum, item) => sum + asNumber(item.amount), 0);
}

async function loadDoctorPaymentRecords(doctorId) {
  const payments = await Payment.find({ doctorId })
    .populate('patientId', 'name email phone')
    .populate('doctorId', 'name email phone')
    .populate({
      path: 'appointmentId',
      populate: [
        { path: 'patient', select: 'name email phone' },
        { path: 'doctor', select: 'name email phone' }
      ]
    })
    .sort({ paymentDate: -1, createdAt: -1 });

  return payments.map((payment) => {
    const appointment = payment.appointmentId || null;
    const paidAt = normalizeDate(payment.paymentDate || payment.createdAt || appointment?.createdAt);
    const paymentStatus = normalizeStatus(payment.paymentStatus || payment.status || 'created');
    const appointmentStatus = normalizeStatus(appointment?.status || 'pending');
    const amount = asNumber(payment.amount || appointment?.consultationFee || 0);

    return {
      _id: asObjectIdString(payment._id),
      doctorId: asObjectIdString(payment.doctorId),
      doctorName: payment.doctorName || payment.doctorId?.name || appointment?.doctor?.name || 'Doctor',
      patientId: payment.patientId?._id || payment.patientId || appointment?.patient?._id || appointment?.patient || null,
      patientName: payment.patientName || payment.patientId?.name || appointment?.patient?.name || 'Patient',
      appointmentId: appointment?._id || payment.appointmentId || null,
      consultationId: payment.consultationId || null,
      consultationType: appointment?.consultationType || appointment?.type || appointment?.mode || 'online',
      amount,
      currency: payment.currency || 'INR',
      status: paymentStatus,
      paymentStatus,
      appointmentStatus,
      consultationStatus: appointmentStatus,
      date: paidAt,
      createdAt: paidAt || payment.createdAt,
      completedAt: normalizeDate(appointment?.completedAt),
      paymentId: payment.paymentId || asObjectIdString(payment._id),
      orderId: payment.orderId || '',
      payment,
      appointment,
      isPaid: isSuccessfulPaymentStatus(paymentStatus),
      isPending: isPendingPaymentStatus(paymentStatus),
      isRefunded: paymentStatus === 'refunded',
      isFailed: paymentStatus === 'failed'
    };
  });
}

function buildChartRange(query = {}) {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const queryRange = getRangeFromQuery(query);

  let start = queryRange.$gte ? new Date(queryRange.$gte) : null;
  let end = queryRange.$lte ? new Date(queryRange.$lte) : null;

  if (!start && !end) {
    end = todayEnd;
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
  } else {
    end = end || todayEnd;
    start = start || new Date(end);
    if (!queryRange.$gte) {
      start.setHours(0, 0, 0, 0);
      start.setDate(end.getDate() - 6);
    }
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.min(Math.max(Math.round((end - start) / dayMs) + 1, 1), 31);
  const normalizedEnd = new Date(start);
  normalizedEnd.setDate(start.getDate() + days - 1);
  normalizedEnd.setHours(23, 59, 59, 999);

  return { start, end: normalizedEnd, days };
}

async function loadDoctorAppointmentsWithPayments(doctorId) {
  const doctorIdString = asObjectIdString(doctorId);
  const appointments = await Appointment.find({ doctor: doctorId })
    .populate('patient', 'name email phone')
    .populate('payment')
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 });

  if (!appointments.length) return [];

  const appointmentIds = appointments.map((appointment) => appointment._id);
  const payments = await Payment.find({
    doctorId,
    appointmentId: { $in: appointmentIds }
  }).sort({ paymentDate: -1, updatedAt: -1, createdAt: -1 });

  const latestPaymentByAppointment = new Map();
  payments.forEach((payment) => {
    const appointmentId = asObjectIdString(payment.appointmentId);
    if (!appointmentId || latestPaymentByAppointment.has(appointmentId)) return;
    latestPaymentByAppointment.set(appointmentId, payment);
  });

  return appointments
    .filter((appointment) => asObjectIdString(appointment.doctor) === doctorIdString)
    .map((appointment) => {
      const payment = appointment.payment || latestPaymentByAppointment.get(asObjectIdString(appointment._id)) || null;
      const amount = asNumber(payment?.amount || appointment.consultationFee || 0);
      const earnedAt = normalizeDate(
        appointment.completedAt
        || payment?.paymentDate
        || appointment.updatedAt
        || appointment.createdAt
        || appointment.scheduledAt
      );
      const consultationStatus = getCompletedStatus(appointment) || 'pending';
      const paymentStatus = String(payment?.paymentStatus || payment?.status || appointment.paymentStatus || 'pending').toLowerCase();

      return {
        _id: asObjectIdString(appointment._id),
        appointmentId: appointment._id,
        doctorId: asObjectIdString(appointment.doctor),
        patientId: appointment.patient?._id || appointment.patient || null,
        patientName: appointment.patient?.name || 'Patient',
        consultationType: appointment.consultationType || appointment.type || appointment.mode || 'online',
        amount,
        currency: payment?.currency || 'INR',
        paymentStatus,
        consultationStatus,
        date: earnedAt,
        completedAt: normalizeDate(appointment.completedAt),
        scheduledAt: normalizeDate(appointment.scheduledAt),
        paymentId: payment?.paymentId || payment?._id || null,
        appointment,
        payment,
        isPaid: isPaidAppointment(appointment, payment),
        isCompleted: isCompletedAppointment(appointment),
        isRefunded: isRefundedAppointment(appointment, payment),
        isCancelled: String(appointment.status || '').toLowerCase() === 'cancelled'
      };
    });
}

function getEligibleEarningRecords(records = []) {
  return records.filter((record) => record.isPaid && record.isCompleted && !record.isRefunded && !record.isCancelled);
}

function getPendingPaymentRecords(records = []) {
  return records.filter((record) => {
    const paymentStatus = String(record.paymentStatus || '').toLowerCase();
    return !record.isCancelled && !record.isRefunded && !record.isPaid && ['pending', 'failed', 'created'].includes(paymentStatus);
  });
}

async function syncDoctorEarningForAppointment(appointmentId) {
  const appointment = await Appointment.findById(appointmentId)
    .populate('payment')
    .populate('patient', 'name email phone')
    .populate('doctor', 'name email phone');

  if (!appointment) return null;

  const doctorId = appointment.doctor?._id || appointment.doctor;
  const patientId = appointment.patient?._id || appointment.patient;
  const payment = appointment.payment || await Payment.findOne(getAppointmentPaymentQuery(appointment._id, doctorId))
    .sort({ paymentDate: -1, updatedAt: -1, createdAt: -1 });
  const amount = asNumber(payment?.amount || appointment.consultationFee || 0);
  const consultationStatus = getCompletedStatus(appointment) || 'pending';
  const earnedAt = normalizeDate(
    appointment.completedAt
    || payment?.paymentDate
    || appointment.updatedAt
    || appointment.createdAt
    || appointment.scheduledAt
  ) || new Date();

  if (String(appointment.status || '').toLowerCase() === 'cancelled' || isRefundedAppointment(appointment, payment)) {
    return DoctorEarning.findOneAndUpdate(
      { doctor: doctorId, appointment: appointment._id },
      {
        doctor: doctorId,
        patient: patientId,
        appointment: appointment._id,
        payment: payment?._id || null,
        consultationType: appointment.consultationType || appointment.type || appointment.mode || 'online',
        amount: 0,
        currency: payment?.currency || 'INR',
        paymentStatus: isRefundedAppointment(appointment, payment) ? 'refunded' : 'failed',
        consultationStatus,
        earnedAt,
        completedAt: appointment.completedAt || null,
        notes: String(appointment.status || '').toLowerCase() === 'cancelled'
          ? 'Excluded because consultation was cancelled.'
          : 'Excluded because payment was refunded.'
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  if (!isPaidAppointment(appointment, payment) || !isCompletedAppointment(appointment)) {
    await DoctorEarning.findOneAndDelete({ doctor: doctorId, appointment: appointment._id });
    return null;
  }

  return DoctorEarning.findOneAndUpdate(
    { doctor: doctorId, appointment: appointment._id },
    {
      doctor: doctorId,
      patient: patientId,
      appointment: appointment._id,
      payment: payment?._id || null,
      consultationType: appointment.consultationType || appointment.type || appointment.mode || 'online',
      amount,
      currency: payment?.currency || 'INR',
      paymentStatus: 'paid',
      consultationStatus,
      earnedAt,
      completedAt: appointment.completedAt || earnedAt,
      notes: 'Auto-recorded after completed paid consultation.'
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function syncDoctorEarningsForDoctor(doctorId) {
  const appointments = await Appointment.find({ doctor: doctorId }).select('_id');
  await Promise.all(appointments.map((appointment) => syncDoctorEarningForAppointment(appointment._id)));
}

async function getDoctorEarningsSummary(doctorId, query = {}) {
  const allRecords = await loadDoctorPaymentRecords(doctorId);
  const range = getRangeFromQuery(query);
  const hasRange = Object.keys(range).length > 0;
  const paidCompletedRecords = allRecords
    .filter((item) => item.isPaid && !item.isRefunded)
    .filter((item) => !hasRange || isDateInRange(item.date, range));
  const pendingRecords = allRecords
    .filter((item) => item.isPending)
    .filter((item) => !hasRange || isDateInRange(item.date || item.createdAt, range));

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - todayStart.getDay());
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const completed = paidCompletedRecords.length;
  const pending = sumAmounts(pendingRecords);

  return {
    today: sumAmounts(paidCompletedRecords.filter((item) => item.date >= todayStart && item.date < todayEnd)),
    week: sumAmounts(paidCompletedRecords.filter((item) => item.date >= weekStart && item.date < todayEnd)),
    month: sumAmounts(paidCompletedRecords.filter((item) => item.date >= monthStart && item.date < todayEnd)),
    total: sumAmounts(paidCompletedRecords),
    completed,
    completedConsultations: completed,
    pending,
    pendingPayments: pending,
    pendingPaymentCount: pendingRecords.length,
    refundedAmount: sumAmounts(allRecords.filter((item) => item.isRefunded))
  };
}

async function getDoctorEarningsHistory(doctorId, query = {}) {
  const range = getRangeFromQuery(query);
  const limit = Math.min(Math.max(Number(query.limit || 120), 1), 300);
  const records = (await loadDoctorPaymentRecords(doctorId))
    .filter((item) => item.isPaid && !item.isRefunded)
    .filter((item) => !Object.keys(range).length || isDateInRange(item.date, range))
    .sort((left, right) => (right.date?.getTime() || 0) - (left.date?.getTime() || 0))
    .slice(0, limit);

  return records.map((item) => ({
    _id: item._id,
    doctorId: item.doctorId,
    doctorName: item.doctorName,
    patientName: item.patientName,
    patientId: item.patientId,
    consultationId: item.consultationId,
    consultationType: item.consultationType,
    amount: asNumber(item.amount),
    currency: item.currency || 'INR',
    paymentStatus: item.paymentStatus || 'paid',
    status: item.status || item.paymentStatus || 'paid',
    appointmentStatus: item.consultationStatus || 'completed',
    consultationStatus: item.consultationStatus || 'completed',
    date: item.date,
    createdAt: item.date,
    completedAt: item.completedAt,
    appointmentId: item.appointmentId,
    paymentId: item.paymentId,
    appointment: item.appointment,
    payment: item.payment
  }));
}

async function getDoctorEarningsChart(doctorId, query = {}) {
  const { start, end, days } = buildChartRange(query);
  const records = (await loadDoctorPaymentRecords(doctorId))
    .filter((item) => item.isPaid && !item.isRefunded)
    .filter((item) => item.date && item.date >= start && item.date <= end);

  const chart = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    day.setHours(0, 0, 0, 0);

    const next = new Date(day);
    next.setDate(day.getDate() + 1);

    const items = records.filter((item) => item.date >= day && item.date < next);
    chart.push({
      label: day.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: day.toISOString().slice(0, 10),
      amount: sumAmounts(items),
      count: items.length
    });
  }

  return chart;
}

module.exports = {
  syncDoctorEarningForAppointment,
  syncDoctorEarningsForDoctor,
  getDoctorEarningsSummary,
  getDoctorEarningsHistory,
  getDoctorEarningsChart,
  loadDoctorPaymentRecords,
  isSuccessfulPaymentStatus
};
