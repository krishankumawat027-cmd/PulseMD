const express = require('express');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const Message = require('../models/Message');
const Payment = require('../models/Payment');
const Prescription = require('../models/Prescription');
const PatientIntakeRequest = require('../models/PatientIntakeRequest');
const DoctorNotification = require('../models/DoctorNotification');
const ConsultationChat = require('../models/ConsultationChat');
const PatientCase = require('../models/PatientCase');
const EmergencyRequest = require('../models/EmergencyRequest');
const User = require('../models/User');
const FamilyMember = require('../models/FamilyMember');
const { signup, login } = require('../controllers/authController');
const { auth, requireRole } = require('../middleware/auth');
const { VALID_DAYS, normalizeSchedule, getAvailabilityState } = require('../utils/availability');
const {
  ensureConsultationChat,
  createChatSystemMessage,
  emitChatStatus
} = require('../utils/consultationChat');
const { createPatientNotification } = require('../utils/patientNotifications');
const { sendSms } = require('../utils/smsService');
const {
  syncDoctorEarningForAppointment,
  getDoctorEarningsSummary,
  getDoctorEarningsHistory,
  getDoctorEarningsChart
} = require('../utils/earnings');

const router = express.Router();

router.post('/signup', (req, res) => {
  req.body.role = 'doctor';
  return signup(req, res);
});

router.post('/login', (req, res) => {
  req.body.role = 'doctor';
  return login(req, res);
});

router.use(auth, requireRole('doctor'));

function shouldSeedDemoData() {
  if (process.env.CAREMITRA_DEMO_DATA === 'false') return false;
  if (process.env.NODE_ENV === 'production' && process.env.CAREMITRA_DEMO_DATA !== 'true') return false;
  return true;
}

function demoEmailForDoctor(doctorId) {
  return `caremitra.demo.patient.${doctorId}@demo.local`;
}

async function ensureDoctorProfile(user) {
  let profile = await DoctorProfile.findOne({ user: user._id }).populate('user', 'name email phone');
  if (profile) return profile;

  profile = await DoctorProfile.create({
    user: user._id,
    specialization: user.specialty || 'General Medicine',
    bio: 'Ready for online consultations.',
    fee: user.consultationFee || 499,
    degreeName: 'Demo MBBS',
    registrationNumber: `DEMO-${String(user._id).slice(-6).toUpperCase()}`,
    isVerified: false,
    verificationStatus: 'pending_review',
    verificationMessage: 'Verification pending review'
  });

  return profile.populate('user', 'name email phone');
}

router.get('/profile', async (req, res) => {
  try {
    const profile = await ensureDoctorProfile(req.user);
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctor profile.', error: error.message });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const updates = {
      name: String(req.body.name || req.user.name || '').trim(),
      phone: String(req.body.phone || req.user.phone || '').trim(),
      specialty: String(req.body.specialty || req.user.specialty || '').trim(),
      consultationFee: Number(req.body.consultationFee ?? req.user.consultationFee ?? 0)
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        specialization: String(req.body.specialization || req.body.specialty || '').trim() || updates.specialty || 'General Medicine',
        bio: String(req.body.bio || '').trim(),
        city: String(req.body.city || '').trim(),
        clinic: String(req.body.clinic || '').trim(),
        experienceYears: Number(req.body.experienceYears || 0),
        fee: Number(req.body.fee ?? req.body.consultationFee ?? updates.consultationFee ?? 0)
      },
      { new: true, upsert: true, runValidators: true }
    ).populate('user', 'name email phone');

    res.json({
      message: 'Doctor profile updated successfully.',
      profile: {
        ...profile.toObject(),
        user
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update doctor profile.', error: error.message });
  }
});

async function ensureDemoDoctorData(req, profile) {
  if (!shouldSeedDemoData()) return false;

  const [appointmentsCount, caseCount, notificationCount, emergencyCount] = await Promise.all([
    Appointment.countDocuments({ doctor: req.user._id }),
    PatientCase.countDocuments({ $or: [{ doctorAssigned: req.user._id }, { notifiedDoctors: req.user._id }] }),
    DoctorNotification.countDocuments({ doctorId: req.user._id }),
    EmergencyRequest.countDocuments({ status: 'ACTIVE' })
  ]);

  if (appointmentsCount || caseCount || notificationCount || emergencyCount) return false;

  const demoPatientEmail = demoEmailForDoctor(req.user._id);
  let demoPatient = await User.findOne({ email: demoPatientEmail });
  if (!demoPatient) {
    demoPatient = await User.create({
      name: 'Demo Patient',
      email: demoPatientEmail,
      phone: '+919876543210',
      role: 'patient',
      password: 'Demo1234',
      selectedLanguage: req.user.selectedLanguage || 'en',
      preferredLanguage: req.user.preferredLanguage || 'en'
    });
  }

  const now = new Date();
  const completedAt = new Date(now);
  completedAt.setHours(now.getHours() - 2);
  const upcomingAt = new Date(now);
  upcomingAt.setDate(now.getDate() + 1);
  upcomingAt.setHours(11, 0, 0, 0);

  const completedAppointment = await Appointment.create({
    patient: demoPatient._id,
    doctor: req.user._id,
    scheduledAt: completedAt,
    reason: 'Follow-up consultation',
    consultationFee: profile.fee || 499,
    paymentStatus: 'paid',
    status: 'completed',
    completedAt
  });

  const payment = await Payment.create({
    patientId: demoPatient._id,
    patientName: demoPatient.name,
    doctorId: req.user._id,
    doctorName: req.user.name || 'Doctor',
    appointmentId: completedAppointment._id,
    amount: completedAppointment.consultationFee,
    orderId: `demo_order_${completedAppointment._id}`,
    paymentStatus: 'paid',
    status: 'paid',
    paymentId: `demo_pay_${String(completedAppointment._id).slice(-8)}`,
    paymentDate: completedAt,
    notes: 'Demo paid appointment'
  });
  completedAppointment.payment = payment._id;
  await completedAppointment.save();
  await syncDoctorEarningForAppointment(completedAppointment._id);

  await Appointment.create({
    patient: demoPatient._id,
    doctor: req.user._id,
    scheduledAt: upcomingAt,
    reason: 'Fever and cough',
    consultationFee: profile.fee || 499,
    paymentStatus: 'pending',
    status: 'pending'
  });

  const patientCase = await PatientCase.create({
    patientId: demoPatient._id,
    patientName: demoPatient.name,
    doctorAssigned: req.user._id,
    notifiedDoctors: [req.user._id],
    symptoms: 'Fever and cough for two days',
    duration: '2 days',
    severity: 'Moderate',
    urgencyLevel: 'medium',
    preferredSpecialty: profile.specialization,
    aiSummary: 'Demo intake summary for dashboard testing.',
    status: 'pending'
  });

  await ConsultationChat.create({
    roomId: req.user._id.toString(),
    doctorId: req.user._id,
    patientId: demoPatient._id,
    status: 'open'
  });

  await DoctorNotification.create([
    {
      doctorId: req.user._id,
      patientId: demoPatient._id,
      relatedPatientId: demoPatient._id,
      type: 'new_patient_case',
      title: 'New patient request',
      message: 'Demo Patient is waiting for AI intake review.',
      patientName: demoPatient.name,
      caseId: patientCase._id,
      symptomSummary: patientCase.symptoms,
      urgencyLevel: patientCase.urgencyLevel
    },
    {
      doctorId: req.user._id,
      patientId: demoPatient._id,
      relatedPatientId: demoPatient._id,
      type: 'payment_received',
      title: 'Payment received',
      message: 'Demo paid consultation payment has been received.',
      patientName: demoPatient.name,
      relatedAppointmentId: completedAppointment._id,
      isRead: true,
      readAt: new Date()
    }
  ]);

  const emergency = await EmergencyRequest.create({
    patient: demoPatient._id,
    patientName: demoPatient.name,
    type: 'one_button',
    status: 'ACTIVE',
    message: 'Demo emergency help requested.',
    emergencyContactName: 'Demo Contact',
    emergencyContactPhone: '+919876543210',
    selectedActions: ['emergency_chat', 'sos_message']
  });

  await DoctorNotification.create({
    doctorId: req.user._id,
    patientId: demoPatient._id,
    relatedPatientId: demoPatient._id,
    type: 'emergency_alert',
    title: 'Emergency mode active',
    message: 'Demo Patient activated emergency mode.',
    patientName: demoPatient.name,
    relatedChatId: emergency._id.toString(),
    symptomSummary: emergency.message,
    urgencyLevel: 'Severe'
  });

  return true;
}

async function ensureDemoEarningsData(req) {
  if (process.env.CAREMITRA_DEMO_DATA !== 'true') return false;

  const existingPaidRecords = await getDoctorEarningsHistory(req.user._id, { limit: 1 });
  if (existingPaidRecords.length) return false;

  const profile = await DoctorProfile.findOne({ user: req.user._id });
  const demoPatientEmail = `earnings-demo-${req.user._id}@caremitra.test`;
  let demoPatient = await User.findOne({ email: demoPatientEmail });
  if (!demoPatient) {
    demoPatient = await User.create({
      name: 'Demo Earnings Patient',
      email: demoPatientEmail,
      phone: '+919876543211',
      role: 'patient',
      password: 'Demo1234',
      selectedLanguage: req.user.selectedLanguage || 'en',
      preferredLanguage: req.user.preferredLanguage || 'en'
    });
  }

  const fee = Number(profile?.fee || req.user.consultationFee || 499);
  const now = new Date();
  const demoItems = [
    { daysAgo: 0, amount: fee, reason: 'Video consultation', consultationType: 'video' },
    { daysAgo: 2, amount: Math.max(fee - 100, 199), reason: 'Chat follow-up', consultationType: 'chat' },
    { daysAgo: 10, amount: fee + 150, reason: 'Online consultation', consultationType: 'online' }
  ];

  for (const item of demoItems) {
    const completedAt = new Date(now);
    completedAt.setDate(now.getDate() - item.daysAgo);
    completedAt.setHours(10 + item.daysAgo, 30, 0, 0);

    const appointment = await Appointment.create({
      patient: demoPatient._id,
      doctor: req.user._id,
      scheduledAt: completedAt,
      completedAt,
      reason: item.reason,
      consultationType: item.consultationType,
      consultationFee: item.amount,
      paymentStatus: 'paid',
      status: 'completed'
    });

    const payment = await Payment.create({
      patientId: demoPatient._id,
      patientName: demoPatient.name,
      doctorId: req.user._id,
      doctorName: req.user.name || 'Doctor',
      appointmentId: appointment._id,
      amount: item.amount,
      orderId: `demo_earnings_order_${appointment._id}`,
      paymentStatus: 'paid',
      status: 'paid',
      paymentId: `demo_earn_${String(appointment._id).slice(-8)}`,
      paymentDate: completedAt,
      notes: 'Demo earnings appointment'
    });

    appointment.payment = payment._id;
    await appointment.save();
    await syncDoctorEarningForAppointment(appointment._id);
  }

  const pendingAt = new Date(now);
  pendingAt.setDate(now.getDate() + 1);
  pendingAt.setHours(12, 0, 0, 0);
  await Appointment.create({
    patient: demoPatient._id,
    doctor: req.user._id,
    scheduledAt: pendingAt,
    reason: 'Pending payment demo',
    consultationType: 'online',
    consultationFee: fee,
    paymentStatus: 'pending',
    status: 'payment_pending'
  });

  return true;
}

function hasInvalidEarningsRange(query = {}) {
  if (!query.from || !query.to) return false;
  const from = new Date(query.from);
  const to = new Date(query.to);
  return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to;
}

async function buildDoctorEarningsResponse(req) {
  if (hasInvalidEarningsRange(req.query)) {
    const error = new Error('Start date cannot be later than end date.');
    error.statusCode = 400;
    throw error;
  }

  const seededDemoData = await ensureDemoEarningsData(req);
  const [summary, chart, records] = await Promise.all([
    getDoctorEarningsSummary(req.user._id, req.query),
    getDoctorEarningsChart(req.user._id, req.query),
    getDoctorEarningsHistory(req.user._id, req.query)
  ]);

  console.info('GET /api/doctor/earnings success:', {
    doctorId: String(req.user._id),
    query: req.query,
    records: records.length,
    total: summary.total || 0,
    pending: summary.pending || summary.pendingPayments || 0
  });

  return {
    success: true,
    demoDataSeeded: seededDemoData,
    summary: {
      today: summary.today || 0,
      week: summary.week || 0,
      month: summary.month || 0,
      total: summary.total || 0,
      completed: summary.completed || summary.completedConsultations || 0,
      pending: summary.pending || summary.pendingPayments || 0,
      pendingCount: summary.pendingPaymentCount || 0
    },
    records,
    chart,
    transactions: records
  };
}

async function requireVerifiedDoctor(req, res, next) {
  try {
    const profile = await DoctorProfile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });
    if (!profile.isVerified && !['verified', 'Verified'].includes(profile.verificationStatus)) {
      return res.status(403).json({
        message: 'Your verification is pending or rejected. Access is limited.'
      });
    }
    req.doctorProfile = profile;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Could not verify doctor access.', error: error.message });
  }
}

router.get('/dashboard', async (req, res) => {
  try {
    let profile = await ensureDoctorProfile(req.user);
    const seededDemoData = await ensureDemoDoctorData(req, profile);
    profile = await DoctorProfile.findOne({ user: req.user._id }).populate('user', 'name email phone');
    const pendingAppointments = await Appointment.countDocuments({ doctor: req.user._id, status: 'pending' });
    const paidAppointments = await Appointment.countDocuments({ doctor: req.user._id, paymentStatus: 'paid' });
    const pendingRequests = await PatientCase.countDocuments({
      $or: [{ doctorAssigned: req.user._id }, { notifiedDoctors: req.user._id }],
      status: { $in: ['pending', 'later'] }
    });
    const unreadNotifications = await DoctorNotification.countDocuments({
      doctorId: req.user._id,
      isRead: false
    });
    const activeChats = await ConsultationChat.countDocuments({
      doctorId: req.user._id,
      status: { $in: ['open', 'prescription_sent', 'reopened'] }
    });
    const closedChats = await ConsultationChat.countDocuments({
      doctorId: req.user._id,
      status: 'closed'
    });
    const reopenedChats = await ConsultationChat.countDocuments({
      doctorId: req.user._id,
      status: 'reopened'
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const todaysAppointments = await Appointment.countDocuments({
      doctor: req.user._id,
      scheduledAt: { $gte: todayStart, $lt: todayEnd }
    });
    const totalPatientsToday = await Appointment.distinct('patient', {
      doctor: req.user._id,
      scheduledAt: { $gte: todayStart, $lt: todayEnd }
    });
    const totalPatients = await Appointment.distinct('patient', { doctor: req.user._id });
    const earningsSummary = await getDoctorEarningsSummary(req.user._id);

    res.json({
      profile,
      availability: getAvailabilityState(profile),
      demoDataSeeded: seededDemoData,
      stats: {
        pendingAppointments,
        todaysAppointments,
        totalPatientsToday: totalPatientsToday.length,
        totalPatients: totalPatients.length,
        paidAppointments,
        pendingRequests,
        unreadNotifications,
        activeChats,
        closedChats,
        reopenedChats,
        totalEarnings: earningsSummary.total,
        pendingEarnings: earningsSummary.pendingPayments
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load dashboard.', error: error.message });
  }
});

router.patch('/verification/demo', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.CAREMITRA_DEMO_VERIFICATION !== 'true') {
      return res.status(403).json({ message: 'Demo verification is disabled in production.' });
    }

    const verified = req.body.verified !== false;
    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        isVerified: verified,
        verificationStatus: verified ? 'verified' : 'pending_review',
        verificationMessage: verified ? 'Verified for demo testing.' : 'Verification pending review',
        verifiedAt: verified ? new Date() : null,
        verificationReviewedAt: new Date()
      },
      { new: true, upsert: false }
    ).populate('user', 'name email phone');

    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });

    res.json({
      message: verified ? 'Doctor marked verified for demo.' : 'Doctor moved back to pending review.',
      profile,
      availability: getAvailabilityState(profile)
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update demo verification.', error: error.message });
  }
});

router.patch('/language', async (req, res) => {
  try {
    const selectedLanguage = String(req.body.language || 'en').toLowerCase();
    if (!['en', 'hi'].includes(selectedLanguage)) {
      return res.status(400).json({ message: 'Unsupported language.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { selectedLanguage, preferredLanguage: selectedLanguage },
      { new: true }
    ).select('-password');

    res.json({ message: 'Language preference saved.', user, selectedLanguage });
  } catch (error) {
    res.status(500).json({ message: 'Could not save language preference.', error: error.message });
  }
});

router.get('/patients', requireVerifiedDoctor, async (req, res) => {
  try {
    const appointments = await Appointment.find({ doctor: req.user._id })
      .populate('patient', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .populate('payment')
      .sort({ scheduledAt: -1 });

    const seen = new Set();
    const patients = appointments
      .filter((appointment) => {
        const id = appointment.patient?._id?.toString();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((appointment) => ({
        patient: appointment.patient,
        issue: appointment.reason || 'General consultation',
        status: appointment.status === 'confirmed' ? 'active' : 'waiting',
        appointment
      }));

    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Could not load patients.', error: error.message });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find({ doctor: req.user._id })
      .populate('patient', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .sort({ scheduledAt: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load appointments.', error: error.message });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const [cases, requests] = await Promise.all([
      PatientCase.find({
      $or: [{ doctorAssigned: req.user._id }, { notifiedDoctors: req.user._id }]
      })
        .populate('patientId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(50),
      PatientIntakeRequest.find({ doctorId: req.user._id })
        .populate('patientId', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(50)
    ]);

    const caseShapes = cases.map(caseToRequestShape);
    const caseRequestIds = new Set(caseShapes.map((item) => String(item.requestId || item.intakeRequestId || '')).filter(Boolean));
    const standaloneRequests = requests
      .filter((request) => !caseRequestIds.has(request._id.toString()))
      .map((request) => ({
        ...request.toObject(),
        requestId: request._id,
        intakeRequestId: request._id,
        caseId: request.caseId || null
      }));

    res.json([...caseShapes, ...standaloneRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    res.status(500).json({ message: 'Could not load patient requests.', error: error.message });
  }
});

router.get('/cases/:doctorId', async (req, res) => {
  try {
    if (req.params.doctorId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view your own patient cases.' });
    }

    const cases = await PatientCase.find({
      $or: [{ doctorAssigned: req.user._id }, { notifiedDoctors: req.user._id }]
    })
      .populate('patientId', 'name email phone')
      .populate('doctorAssigned', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(80);

    res.json(cases);
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctor patient cases.', error: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await DoctorNotification.find({ doctorId: req.user._id })
      .populate('requestId')
      .populate('relatedRequestId')
      .populate('caseId')
      .populate('patientId', 'name email phone')
      .populate('relatedPatientId', 'name email phone')
      .populate({
        path: 'relatedAppointmentId',
        populate: { path: 'patient', select: 'name email phone' }
      })
      .sort({ createdAt: -1 })
      .limit(60);
    const unreadCount = await DoctorNotification.countDocuments({ doctorId: req.user._id, isRead: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctor notifications.', error: error.message });
  }
});

router.get('/notifications/:doctorId', async (req, res) => {
  try {
    if (req.params.doctorId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view your own notifications.' });
    }

    const notifications = await DoctorNotification.find({ doctorId: req.user._id })
      .populate('requestId')
      .populate('relatedRequestId')
      .populate('caseId')
      .populate('patientId', 'name email phone')
      .populate('relatedPatientId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(80);
    const unreadCount = await DoctorNotification.countDocuments({ doctorId: req.user._id, isRead: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctor notifications.', error: error.message });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await DoctorNotification.findOneAndUpdate(
      { _id: req.params.id, doctorId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found.' });

    res.json({ ok: true, notification });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark notification read.', error: error.message });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await DoctorNotification.updateMany(
      { doctorId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark notifications read.', error: error.message });
  }
});

router.patch('/notifications/read', async (req, res) => {
  try {
    await DoctorNotification.updateMany(
      { doctorId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark notifications read.', error: error.message });
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    const notification = await DoctorNotification.findOneAndDelete({
      _id: req.params.id,
      doctorId: req.user._id
    });

    if (!notification) return res.status(404).json({ message: 'Notification not found.' });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete notification.', error: error.message });
  }
});

router.get('/emergencies/active', async (req, res) => {
  try {
    const emergencies = await EmergencyRequest.find({ status: 'ACTIVE' })
      .populate('patient', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(40);

    res.json(emergencies);
  } catch (error) {
    res.status(500).json({ message: 'Could not load active emergencies.', error: error.message });
  }
});

router.patch('/emergencies/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['HANDLED', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid emergency status.' });
    }

    const update = { status, handledBy: req.user._id };
    if (status === 'HANDLED' || status === 'RESOLVED') update.handledAt = new Date();
    if (status === 'RESOLVED' || status === 'CLOSED' || status === 'CANCELLED') update.closedAt = new Date();

    const emergency = await EmergencyRequest.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patient', 'name email phone');
    if (!emergency) return res.status(404).json({ message: 'Emergency request not found.' });

    await DoctorNotification.updateMany(
      { doctorId: req.user._id, relatedChatId: emergency._id.toString(), type: 'emergency_alert' },
      { isRead: true, readAt: new Date() }
    );

    await createPatientNotification(req.app, {
      patientId: emergency.patient._id || emergency.patient,
      type: 'emergency_update',
      title: `Emergency marked ${status.toLowerCase()}`,
      message: `Your emergency request was marked ${status.toLowerCase()} by Dr. ${req.user.name || 'PulseMD - Virtual Clinic doctor'}.`,
      relatedEmergencyId: emergency._id
    });

    res.json({ message: `Emergency marked ${status.toLowerCase()}.`, emergency });
  } catch (error) {
    res.status(500).json({ message: 'Could not update emergency status.', error: error.message });
  }
});

router.get('/request/:id', async (req, res) => {
  try {
    console.info('Doctor request detail lookup:', {
      doctorId: req.user._id.toString(),
      requestId: req.params.id
    });
    const resolved = await resolveDoctorPatientRequest(req.params.id, req.user._id);
    if (resolved.errorStatus) {
      console.warn('Doctor request detail not resolved:', {
        doctorId: req.user._id.toString(),
        requestId: req.params.id,
        status: resolved.errorStatus,
        message: resolved.message
      });
      return res.status(resolved.errorStatus).json({
        success: false,
        message: resolved.message,
        requestId: req.params.id
      });
    }

    await markRequestNotificationsRead(req.user._id, resolved);
    const payload = resolved.patientCase
      ? caseToRequestShape(resolved.patientCase)
      : resolved.request.toObject();
    payload.aiSummary = payload.aiSummary || resolved.request?.aiSummary || resolved.patientCase?.aiSummary || '';
    payload.requestId = resolved.request?._id || payload.requestId || payload._id;
    payload.caseId = resolved.patientCase?._id || payload.caseId || resolved.request?.caseId || null;
    payload.source = resolved.source;
    console.info('Doctor request detail resolved:', {
      doctorId: req.user._id.toString(),
      requestId: req.params.id,
      source: resolved.source,
      caseId: payload.caseId?.toString?.() || payload.caseId || null,
      intakeRequestId: payload.requestId?.toString?.() || payload.requestId || null,
      hasAiSummary: Boolean(payload.aiSummary)
    });

    res.json({ success: true, request: payload });
  } catch (error) {
    console.error('Could not load patient request:', {
      doctorId: req.user?._id?.toString?.(),
      requestId: req.params.id,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ success: false, message: 'Unable to load patient request.', error: error.message });
  }
});

router.post('/request/:id/join', async (req, res) => {
  try {
    console.info('Doctor request join lookup:', {
      doctorId: req.user._id.toString(),
      requestId: req.params.id
    });
    const resolved = await resolveDoctorPatientRequest(req.params.id, req.user._id);
    if (resolved.errorStatus) {
      return res.status(resolved.errorStatus).json({
        success: false,
        message: resolved.message,
        requestId: req.params.id
      });
    }

    const patientCase = resolved.patientCase;
    if (patientCase) {
      patientCase.doctorAssigned = req.user._id;
      patientCase.status = 'in-progress';
      patientCase.startedAt = patientCase.startedAt || new Date();
      await patientCase.save();
      if (resolved.request) {
        resolved.request.status = 'joined';
        resolved.request.joinedAt = resolved.request.joinedAt || new Date();
        await resolved.request.save();
      }
      await markRequestNotificationsRead(req.user._id, resolved);
      const requestShape = caseToRequestShape(patientCase);
      requestShape.requestId = resolved.request?._id || requestShape.requestId;
      await createDoctorJoinedChat(req, requestShape, patientCase.patientId._id);
      await createPatientNotification(req.app, {
        patientId: patientCase.patientId._id,
        type: 'doctor_accepted_case',
        title: 'Doctor accepted your case',
        message: `Dr. ${req.user.name || 'PulseMD - Virtual Clinic doctor'} reviewed your AI intake and joined the consultation.`,
        relatedCaseId: patientCase._id,
        relatedChatId: req.user._id.toString()
      });
      await createPatientNotification(req.app, {
        patientId: patientCase.patientId._id,
        type: 'doctor_joined_consultation',
        title: 'Doctor joined your consultation',
        message: `Dr. ${req.user.name || 'PulseMD - Virtual Clinic doctor'} has joined your chat.`,
        relatedCaseId: patientCase._id,
        relatedChatId: req.user._id.toString()
      });
      return res.json({ message: 'Doctor joined the chat.', request: requestShape });
    }

    const request = await PatientIntakeRequest.findOneAndUpdate(
      { _id: resolved.request._id, doctorId: req.user._id },
      { status: 'joined', joinedAt: new Date() },
      { new: true }
    ).populate('patientId', 'name email phone');

    if (!request) return res.status(404).json({ message: 'Patient request not found.' });

    await markRequestNotificationsRead(req.user._id, { ...resolved, request });

    await createDoctorJoinedChat(req, request, request.patientId._id);
    await createPatientNotification(req.app, {
      patientId: request.patientId._id,
      type: 'doctor_joined_consultation',
      title: 'Doctor joined your consultation',
      message: `Dr. ${req.user.name || 'PulseMD - Virtual Clinic doctor'} has joined your chat.`,
      relatedRequestId: request._id,
      relatedChatId: req.user._id.toString()
    });

    res.json({ message: 'Doctor joined the chat.', request });
  } catch (error) {
    console.error('Could not join patient chat:', {
      doctorId: req.user?._id?.toString?.(),
      requestId: req.params.id,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: 'Could not join patient chat.', error: error.message });
  }
});

function caseToRequestShape(patientCase) {
  return {
    _id: patientCase._id,
    caseId: patientCase._id,
    intakeRequestId: patientCase.intakeRequestId || null,
    requestId: patientCase.intakeRequestId || null,
    patientId: patientCase.patientId,
    doctorId: patientCase.doctorAssigned,
    appointmentId: patientCase.appointmentId,
    name: patientCase.patientName,
    age: patientCase.age,
    weight: patientCase.weight,
    gender: patientCase.gender,
    symptoms: patientCase.symptoms,
    duration: patientCase.duration,
    severity: patientCase.severity,
    urgencyLevel: patientCase.urgencyLevel,
    preferredSpecialty: patientCase.preferredSpecialty,
    medicalNotes: patientCase.medicalNotes,
    currentMedicines: patientCase.currentMedicines,
    aiSummary: patientCase.aiSummary,
    aiChatMessages: patientCase.aiChatMessages || [],
    status: patientCase.status === 'pending' ? 'waiting' : patientCase.status === 'in-progress' ? 'joined' : patientCase.status,
    joinedAt: patientCase.startedAt,
    createdAt: patientCase.createdAt,
    updatedAt: patientCase.updatedAt
  };
}

async function resolveDoctorPatientRequest(rawId, doctorId) {
  const id = String(rawId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { errorStatus: 400, message: 'Invalid patient request id.' };
  }

  const doctorAccess = { $or: [{ doctorAssigned: doctorId }, { notifiedDoctors: doctorId }] };
  let patientCase = await PatientCase.findById(id).populate('patientId', 'name email phone');
  if (patientCase) {
    const assignedDoctor = patientCase.doctorAssigned?.toString?.() || '';
    const notifiedDoctors = (patientCase.notifiedDoctors || []).map((item) => item.toString());
    const hasAccess = assignedDoctor === doctorId.toString() || notifiedDoctors.includes(doctorId.toString());
    if (!hasAccess) patientCase = null;
  }
  if (!patientCase) {
    patientCase = await PatientCase.findOne({
      $and: [
        { intakeRequestId: id },
        doctorAccess
      ]
    }).populate('patientId', 'name email phone');
  }

  if (patientCase) {
    const request = patientCase.intakeRequestId
      ? await PatientIntakeRequest.findOne({
        _id: patientCase.intakeRequestId,
        doctorId
      }).populate('patientId', 'name email phone').populate('doctorId', 'name email phone')
      : await PatientIntakeRequest.findOne({
        caseId: patientCase._id,
        doctorId
      }).populate('patientId', 'name email phone').populate('doctorId', 'name email phone');

    return { source: 'case', patientCase, request };
  }

  let request = await PatientIntakeRequest.findById(id)
    .populate('patientId', 'name email phone')
    .populate('doctorId', 'name email phone');
  if (request && request.doctorId?._id?.toString?.() !== doctorId.toString()) request = null;
  if (!request) {
    request = await PatientIntakeRequest.findOne({ caseId: id, doctorId })
      .populate('patientId', 'name email phone')
      .populate('doctorId', 'name email phone');
  }

  if (!request) {
    return { errorStatus: 404, message: 'Patient request not found.' };
  }

  const linkedCaseId = request.caseId || (request._id.toString() === id ? null : id);
  const linkedCase = linkedCaseId
    ? await PatientCase.findOne({
      $and: [
        { $or: [{ _id: linkedCaseId }, { intakeRequestId: request._id }] },
        doctorAccess
      ]
    }).populate('patientId', 'name email phone')
    : await PatientCase.findOne({
      $and: [
        { intakeRequestId: request._id },
        doctorAccess
      ]
    }).populate('patientId', 'name email phone');

  return { source: linkedCase ? 'request_with_case' : 'request', request, patientCase: linkedCase };
}

async function markRequestNotificationsRead(doctorId, resolved) {
  const caseId = resolved.patientCase?._id;
  const requestId = resolved.request?._id || resolved.patientCase?.intakeRequestId;
  const clauses = [];
  if (caseId) {
    clauses.push({ caseId });
    clauses.push({ relatedChatId: caseId.toString() });
  }
  if (requestId) {
    clauses.push({ requestId });
    clauses.push({ relatedRequestId: requestId });
  }
  if (!clauses.length) return;

  await DoctorNotification.updateMany(
    { doctorId, $or: clauses },
    { isRead: true, readAt: new Date() }
  );
}

async function createDoctorJoinedChat(req, request, patientId) {
  const roomId = req.user._id.toString();
  const chat = await ensureConsultationChat({
    roomId,
    doctorId: req.user._id,
    patientId,
    appointmentId: request.appointmentId || null,
    requestId: request.requestId || request.intakeRequestId || request._id,
    status: 'open',
    aiSummary: request.aiSummary || ''
  });
  console.info('Doctor joined chat with AI summary:', {
    doctorId: req.user._id.toString(),
    patientId: patientId?.toString?.() || String(patientId),
    requestId: (request.requestId || request.intakeRequestId || request._id)?.toString?.() || String(request.requestId || request.intakeRequestId || request._id),
    caseId: request.caseId?.toString?.() || '',
    chatId: chat._id.toString(),
    hasAiSummary: Boolean(chat.aiSummary || request.aiSummary)
  });
  const joinedMessage = await Message.create({
    roomId,
    chatRoomId: roomId,
    appointmentId: request.appointmentId || null,
    sender: req.user._id,
    receiver: patientId,
    text: `Doctor has joined the chat at ${new Date().toLocaleString('en-IN')}.`,
    type: 'system'
  });

  const io = req.app.get('io');
  if (io) {
    const populatedMessage = await joinedMessage.populate('sender', 'name role');
    io.to(roomId).emit('receiveMessage', populatedMessage);
    io.to(roomId).emit('chatStatusUpdated', {
      chatId: chat._id,
      roomId,
      status: chat.status,
      aiSummary: chat.aiSummary || request.aiSummary || '',
      prescriptionSent: Boolean(chat.prescriptionSent || chat.prescriptionId || chat.status === 'prescription_sent'),
      updatedAt: chat.updatedAt
    });
    io.to(`doctor-notify:${req.user._id}`).emit('doctorNotificationRead', {
      requestId: request._id,
      caseId: request.caseId || request._id
    });
  }
}

router.post('/request/:id/decline', async (req, res) => {
  try {
    const resolved = await resolveDoctorPatientRequest(req.params.id, req.user._id);
    if (resolved.errorStatus) {
      return res.status(resolved.errorStatus).json({
        success: false,
        message: resolved.message,
        requestId: req.params.id
      });
    }

    const patientCase = resolved.patientCase;
    if (patientCase) {
      patientCase.status = 'declined';
      await patientCase.save();
      if (resolved.request) {
        resolved.request.status = 'declined';
        await resolved.request.save();
      }
      await DoctorNotification.updateMany(
        { doctorId: req.user._id, relatedChatId: patientCase._id.toString() },
        { isRead: true, readAt: new Date() }
      );
      await notifyPatientRequestStatus(req, caseToRequestShape(patientCase), 'Your request was reviewed. Please book another doctor or try again shortly.');
      await createPatientNotification(req.app, {
        patientId: patientCase.patientId._id,
        type: 'request_declined',
        title: 'Consultation request update',
        message: 'Your request was reviewed. Please book another doctor or try again shortly.',
        relatedCaseId: patientCase._id
      });
      return res.json({ message: 'Request declined.', request: caseToRequestShape(patientCase) });
    }

    const request = await PatientIntakeRequest.findOneAndUpdate(
      { _id: resolved.request._id, doctorId: req.user._id },
      { status: 'declined' },
      { new: true }
    ).populate('patientId', 'name email phone');

    if (!request) return res.status(404).json({ message: 'Patient request not found.' });
    await DoctorNotification.updateMany(
      { doctorId: req.user._id, $or: [{ requestId: request._id }, { relatedRequestId: request._id }] },
      { isRead: true, readAt: new Date() }
    );
    await notifyPatientRequestStatus(req, request, 'Your request was reviewed. Please book another doctor or try again shortly.');
    await createPatientNotification(req.app, {
      patientId: request.patientId._id,
      type: 'request_declined',
      title: 'Consultation request update',
      message: 'Your request was reviewed. Please book another doctor or try again shortly.',
      relatedRequestId: request._id
    });
    res.json({ message: 'Request declined.', request });
  } catch (error) {
    res.status(500).json({ message: 'Could not decline request.', error: error.message });
  }
});

router.post('/request/:id/later', async (req, res) => {
  try {
    const resolved = await resolveDoctorPatientRequest(req.params.id, req.user._id);
    if (resolved.errorStatus) {
      return res.status(resolved.errorStatus).json({
        success: false,
        message: resolved.message,
        requestId: req.params.id
      });
    }

    const patientCase = resolved.patientCase;
    if (patientCase) {
      patientCase.status = 'later';
      await patientCase.save();
      if (resolved.request) {
        resolved.request.status = 'later';
        await resolved.request.save();
      }
      await notifyPatientRequestStatus(req, caseToRequestShape(patientCase), 'The doctor marked your request for later review. Please stay on this screen or check again soon.');
      await createPatientNotification(req.app, {
        patientId: patientCase.patientId._id,
        type: 'request_later',
        title: 'Doctor will review soon',
        message: 'The doctor marked your request for later review. Please stay on this screen or check again soon.',
        relatedCaseId: patientCase._id
      });
      return res.json({ message: 'Request marked for later.', request: caseToRequestShape(patientCase) });
    }

    const request = await PatientIntakeRequest.findOneAndUpdate(
      { _id: resolved.request._id, doctorId: req.user._id },
      { status: 'later' },
      { new: true }
    ).populate('patientId', 'name email phone');

    if (!request) return res.status(404).json({ message: 'Patient request not found.' });
    await notifyPatientRequestStatus(req, request, 'The doctor marked your request for later review. Please stay on this screen or check again soon.');
    await createPatientNotification(req.app, {
      patientId: request.patientId._id,
      type: 'request_later',
      title: 'Doctor will review soon',
      message: 'The doctor marked your request for later review. Please stay on this screen or check again soon.',
      relatedRequestId: request._id
    });
    res.json({ message: 'Request marked for later.', request });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark request for later.', error: error.message });
  }
});

async function notifyPatientRequestStatus(req, request, text) {
  if (!request?.patientId) return;

  const roomId = req.user._id.toString();
  const patientId = request.patientId._id || request.patientId;
  const message = await Message.create({
    roomId,
    chatRoomId: roomId,
    appointmentId: request.appointmentId || null,
    sender: req.user._id,
    receiver: patientId,
    text
  });

  const io = req.app.get('io');
  if (io) {
    const populatedMessage = await message.populate('sender', 'name role');
    io.to(roomId).emit('receiveMessage', populatedMessage);
  }
}

router.patch('/appointments/:id/status', requireVerifiedDoctor, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'payment_pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid appointment status.' });
    }

    const statusUpdate = { status };
    if (status === 'completed') statusUpdate.completedAt = new Date();
    if (status === 'cancelled') statusUpdate.cancelledAt = new Date();

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctor: req.user._id },
      statusUpdate,
      { new: true }
    ).populate('patient', 'name email phone');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    await createPatientNotification(req.app, {
      patientId: appointment.patient._id || appointment.patient,
      type: status === 'confirmed' ? 'appointment_approved' : status === 'cancelled' ? 'appointment_rejected' : 'appointment_status',
      title: status === 'confirmed' ? 'Appointment approved' : status === 'cancelled' ? 'Appointment cancelled' : 'Appointment updated',
      message: `Your appointment status is now ${status.replace('_', ' ')}.`,
      relatedAppointmentId: appointment._id
    });

    if (status === 'confirmed' && appointment.patient?.phone) {
      await sendSms({
        to: appointment.patient.phone,
        message: `PulseMD - Virtual Clinic: Your appointment with Dr. ${req.user.name || 'PulseMD - Virtual Clinic doctor'} is confirmed for ${new Date(appointment.scheduledAt).toLocaleString('en-IN')}.`
      });
    }

    if (status === 'completed') {
      await syncDoctorEarningForAppointment(appointment._id);
    } else if (status === 'cancelled') {
      await syncDoctorEarningForAppointment(appointment._id);
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Could not update appointment.', error: error.message });
  }
});

router.delete('/appointments/:id', requireVerifiedDoctor, async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndDelete({
      _id: req.params.id,
      doctor: req.user._id
    });

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    await Promise.all([
      Payment.deleteMany({ appointmentId: appointment._id, doctorId: req.user._id }),
      DoctorNotification.deleteMany({ relatedAppointmentId: appointment._id, doctorId: req.user._id })
    ]);

    res.json({ ok: true, message: 'Appointment deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete appointment.', error: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.find({ doctorId: req.user._id })
      .populate('patientId', 'name email phone')
      .populate('appointmentId')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load payments.', error: error.message });
  }
});

router.get('/earnings', async (req, res) => {
  try {
    res.json(await buildDoctorEarningsResponse(req));
  } catch (error) {
    console.error('GET /api/doctor/earnings failed:', {
      doctorId: req.user?._id,
      query: req.query,
      statusCode: error.statusCode || 500,
      message: error.message,
      stack: error.stack
    });
    res.status(error.statusCode || 500).json({ message: error.message || 'Could not load doctor earnings.' });
  }
});

router.get('/earnings/summary', async (req, res) => {
  try {
    res.json(await getDoctorEarningsSummary(req.user._id));
  } catch (error) {
    console.error('Doctor earnings summary route failed:', error);
    res.status(500).json({ message: 'Could not load earnings summary.', error: error.message });
  }
});

router.get('/earnings/history', async (req, res) => {
  try {
    res.json(await getDoctorEarningsHistory(req.user._id, req.query));
  } catch (error) {
    console.error('Doctor earnings history route failed:', error);
    res.status(500).json({ message: 'Could not load earnings history.', error: error.message });
  }
});

router.get('/earnings/chart', async (req, res) => {
  try {
    res.json(await getDoctorEarningsChart(req.user._id, req.query));
  } catch (error) {
    console.error('Doctor earnings chart route failed:', error);
    res.status(500).json({ message: 'Could not load earnings chart.', error: error.message });
  }
});

router.post('/prescriptions', requireVerifiedDoctor, async (req, res) => {
  try {
    const { patientId, appointmentId, familyMemberId = '', medicines = [], notes = '', advice = '' } = req.body;

    if (!patientId || !medicines.length) {
      return res.status(400).json({ message: 'Patient and at least one medicine are required.' });
    }

    let appointment = null;
    let familyMember = null;
    if (appointmentId) {
      appointment = await Appointment.findOne({
        _id: appointmentId,
        doctor: req.user._id,
        patient: patientId
      }).populate('familyMemberId', 'fullName relation age gender bloodGroup');
      if (!appointment) return res.status(404).json({ message: 'Appointment not found for this patient.' });
      familyMember = appointment.familyMemberId || null;
    }

    if (!familyMember && familyMemberId) {
      familyMember = await FamilyMember.findOne({ _id: familyMemberId, userId: patientId });
      if (!familyMember) return res.status(404).json({ message: 'Family member not found for this patient.' });
    }

    const prescription = await Prescription.create({
      doctor: req.user._id,
      patient: patientId,
      familyMemberId: familyMember?._id || null,
      appointment: appointmentId || null,
      medicines,
      notes,
      advice
    });

    const populated = await prescription.populate([
      { path: 'doctor', select: 'name email phone' },
      { path: 'patient', select: 'name email phone' },
      { path: 'familyMemberId', select: 'fullName relation age gender bloodGroup' },
      { path: 'appointment' }
    ]);

    const chat = await ensureConsultationChat({
      roomId: req.user._id.toString(),
      doctorId: req.user._id,
      patientId,
      familyMemberId: familyMember?._id || null,
      appointmentId: appointmentId || null,
      status: 'prescription_sent'
    });
    chat.status = 'prescription_sent';
    chat.prescriptionId = prescription._id;
    chat.prescriptionSent = true;
    await chat.save();

    const systemMessage = await createChatSystemMessage({
      roomId: chat.roomId,
      senderId: req.user._id,
      receiverId: patientId,
      appointmentId: appointmentId || null,
      familyMemberId: familyMember?._id || null,
      text: 'Prescription has been shared by doctor.'
    });
    await emitChatStatus(req.app, chat, systemMessage);

    await createPatientNotification(req.app, {
      patientId,
      type: 'prescription_uploaded',
      title: 'Prescription uploaded',
      message: familyMember ? `Your doctor has shared a digital prescription for ${familyMember.fullName}.` : 'Your doctor has shared a digital prescription.',
      relatedAppointmentId: appointmentId || null,
      relatedPrescriptionId: prescription._id,
      relatedChatId: chat.roomId
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Could not create prescription.', error: error.message });
  }
});

router.get('/prescriptions', async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ doctor: req.user._id })
      .populate('doctor', 'name email phone')
      .populate('patient', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup')
      .populate('appointment')
      .sort({ prescriptionDate: -1 });

    res.json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: 'Could not load prescriptions.', error: error.message });
  }
});

router.patch('/availability', requireVerifiedDoctor, async (req, res) => {
  try {
    const { availabilityStatus } = req.body;
    if (!['available', 'busy', 'offline'].includes(availabilityStatus)) {
      return res.status(400).json({ message: 'Invalid availability status.' });
    }

    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      { availabilityStatus },
      { new: true }
    ).populate('user', 'name email phone');

    res.json({
      ...profile.toObject(),
      availability: getAvailabilityState(profile)
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update availability.', error: error.message });
  }
});

router.patch('/availability/schedule', requireVerifiedDoctor, async (req, res) => {
  try {
    const incomingDays = Array.isArray(req.body.days) ? req.body.days : [];
    const incomingSlots = Array.isArray(req.body.slots) ? req.body.slots : [];

    const days = incomingDays
      .map((day) => String(day || '').slice(0, 3))
      .filter((day, index, arr) => VALID_DAYS.includes(day) && arr.indexOf(day) === index);
    if (!days.length) {
      return res.status(400).json({ message: 'Select at least one active day.' });
    }

    const slots = incomingSlots
      .map((slot) => ({
        startTime: String(slot?.startTime || ''),
        endTime: String(slot?.endTime || '')
      }))
      .filter((slot) => slot.startTime && slot.endTime);

    if (!slots.length) {
      return res.status(400).json({ message: 'Add at least one active time slot.' });
    }

    const normalized = normalizeSchedule({
      timezone: 'Asia/Kolkata',
      days,
      slots
    });

    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        availabilitySchedule: {
          timezone: 'Asia/Kolkata',
          days: normalized.days,
          slots: normalized.slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime
          }))
        }
      },
      { new: true }
    ).populate('user', 'name email phone');

    res.json({
      profile,
      availability: getAvailabilityState(profile)
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update availability schedule.', error: error.message });
  }
});

router.patch('/payment-settings', async (req, res) => {
  try {
    const paymentSettings = {
      upiId: String(req.body.upiId || '').trim(),
      bankAccountHolderName: String(req.body.bankAccountHolderName || '').trim(),
      bankAccountNumber: String(req.body.bankAccountNumber || '').trim(),
      ifscCode: String(req.body.ifscCode || '').trim().toUpperCase(),
      paymentQrCode: String(req.body.paymentQrCode || '').trim(),
      updatedAt: new Date()
    };

    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      { paymentSettings },
      { new: true }
    ).populate('user', 'name email phone');

    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });
    res.json({ message: 'Payment settings updated successfully.', paymentSettings: profile.paymentSettings });
  } catch (error) {
    res.status(500).json({ message: 'Could not update payment settings.', error: error.message });
  }
});

router.get('/messages/:patientId', requireVerifiedDoctor, async (req, res) => {
  try {
    const roomId = req.user._id.toString();
    const messages = await Message.find({
      roomId,
      $or: [
        { sender: req.params.patientId, receiver: req.user._id },
        { sender: req.user._id, receiver: req.params.patientId }
      ]
    })
      .populate('sender', 'name role')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Could not load messages.', error: error.message });
  }
});

module.exports = router;
