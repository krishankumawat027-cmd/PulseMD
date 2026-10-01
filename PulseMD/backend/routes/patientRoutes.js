const express = require('express');
const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const Message = require('../models/Message');
const Payment = require('../models/Payment');
const Prescription = require('../models/Prescription');
const PatientProfile = require('../models/PatientProfile');
const EmergencyRequest = require('../models/EmergencyRequest');
const PatientNotification = require('../models/PatientNotification');
const SymptomHistory = require('../models/SymptomHistory');
const FamilyMember = require('../models/FamilyMember');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');
const { isWithinSchedule, getAvailabilityState } = require('../utils/availability');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { analyzeAndSaveSymptomCheck } = require('../utils/symptomChecker');

const router = express.Router();

router.use(auth, requireRole('patient'));

const SYMPTOM_RULES = [
  {
    keywords: ['chest pain', 'breathless', 'shortness of breath', 'left arm pain'],
    specialty: 'Cardiologist',
    departments: ['Cardiology', 'Emergency Medicine'],
    urgencyLevel: 'High',
    advice: ['Seek urgent medical help immediately.', 'Avoid exertion and keep someone nearby.', 'Use the Emergency button if symptoms are severe.']
  },
  {
    keywords: ['skin rash', 'rash', 'itching', 'acne', 'skin issue'],
    specialty: 'Dermatologist',
    departments: ['Dermatology'],
    urgencyLevel: 'Low',
    advice: ['Avoid scratching the affected area.', 'Keep the skin clean and dry.', 'Book a dermatologist if the rash spreads or persists.']
  },
  {
    keywords: ['stomach pain', 'vomiting', 'diarrhea', 'acidity', 'abdominal pain'],
    specialty: 'Gastroenterologist',
    departments: ['Gastroenterology', 'General Medicine'],
    urgencyLevel: 'Medium',
    advice: ['Drink fluids in small sips.', 'Avoid oily or spicy food.', 'Consult urgently if pain is severe or there is blood in stool.']
  },
  {
    keywords: ['headache', 'migraine', 'dizziness', 'weakness'],
    specialty: 'General Physician',
    departments: ['General Medicine', 'Neurology'],
    urgencyLevel: 'Medium',
    advice: ['Rest in a quiet place and hydrate.', 'Track fever, vomiting, or vision changes.', 'Consult a doctor if symptoms are sudden or worsening.']
  },
  {
    keywords: ['fever', 'cough', 'cold', 'sore throat', 'flu'],
    specialty: 'General Physician',
    departments: ['General Medicine'],
    urgencyLevel: 'Low',
    advice: ['Rest and drink warm fluids.', 'Monitor temperature regularly.', 'Book a physician if fever persists beyond 2 days or breathing becomes difficult.']
  }
];

function analyzeSymptoms(symptomText = '', symptoms = []) {
  const combined = `${symptomText} ${symptoms.join(' ')}`.toLowerCase();
  const match = SYMPTOM_RULES.find((rule) => rule.keywords.some((keyword) => combined.includes(keyword)));
  if (match) {
    return {
      suggestedSpecialty: match.specialty,
      suggestedDepartments: match.departments,
      urgencyLevel: match.urgencyLevel,
      careAdvice: match.advice
    };
  }

  return {
    suggestedSpecialty: 'General Physician',
    suggestedDepartments: ['General Medicine'],
    urgencyLevel: 'Low',
    careAdvice: ['Keep a note of symptom duration and severity.', 'Stay hydrated and rest.', 'Book a doctor if symptoms continue or worsen.']
  };
}

router.get('/doctors', async (req, res) => {
  try {
    const doctors = await DoctorProfile.find({
      verificationStatus: { $ne: 'rejected' }
    })
      .populate('user', 'name email phone role')
      .sort({ availabilityStatus: 1, createdAt: -1 });
    const now = new Date();
    const doctorList = doctors.filter((doctor) => doctor.user).map((doctor) => {
      const value = doctor.toObject();
      delete value.paymentSettings;
      delete value.verificationDocuments;
      value.name = value.user?.name || 'Doctor';
      value.specialization = value.specialization || value.user?.specialty || 'General Medicine';
      value.city = value.city || 'Online';
      value.fee = Number(value.fee || value.user?.consultationFee || 0);
      value.canBook = Boolean(value.isVerified || ['verified', 'Verified'].includes(value.verificationStatus));
      value.availability = getAvailabilityState(doctor, now);
      return value;
    });

    res.json(doctorList);
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctors.', error: error.message });
  }
});

router.post('/appointments', async (req, res) => {
  try {
    const { doctorId, scheduledAt, reason, symptomHistoryId = '', familyMemberId = '' } = req.body;

    if (!doctorId || !scheduledAt) {
      return res.status(400).json({ message: 'Doctor and appointment time are required.' });
    }

    const doctorProfile = await DoctorProfile.findOne({ user: doctorId });
    if (!doctorProfile || (!doctorProfile.isVerified && !['verified', 'Verified'].includes(doctorProfile.verificationStatus))) {
      return res.status(403).json({ message: 'Only verified doctors can accept appointment bookings.' });
    }
    if (doctorProfile.availabilityStatus === 'offline') {
      return res.status(403).json({ message: 'Doctor is currently offline. Please choose another slot.' });
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: 'Invalid appointment date/time.' });
    }

    if (!isWithinSchedule(scheduledDate, doctorProfile.availabilitySchedule)) {
      const availability = getAvailabilityState(doctorProfile);
      return res.status(400).json({
        message: `Please select a slot during doctor active time. ${availability.label}`,
        availability
      });
    }

    const consultationFee = doctorProfile?.fee || 0;
    let familyMember = null;
    if (familyMemberId) {
      familyMember = await FamilyMember.findOne({ _id: familyMemberId, userId: req.user._id });
      if (!familyMember) return res.status(404).json({ message: 'Family member not found for this account.' });
    }

    let symptomHistory = null;
    if (symptomHistoryId) {
      const symptomQuery = { _id: symptomHistoryId, patient: req.user._id };
      if (familyMember) symptomQuery.familyMemberId = familyMember._id;
      symptomHistory = await SymptomHistory.findOne(symptomQuery);
      if (!symptomHistory) return res.status(404).json({ message: 'Symptom history not found.' });
    }

    const appointment = await Appointment.create({
      patient: req.user._id,
      familyMemberId: familyMember?._id || null,
      doctor: doctorId,
      scheduledAt,
      reason,
      symptomSummary: symptomHistory ? symptomHistory.symptomText || symptomHistory.symptoms.join(', ') : '',
      symptomHistory: symptomHistory?._id || null,
      suggestedSpecialty: symptomHistory?.suggestedSpecialty || '',
      urgencyLevel: symptomHistory?.urgencyLevel || '',
      consultationFee,
      paymentStatus: consultationFee > 0 ? 'pending' : 'not_required',
      status: consultationFee > 0 ? 'payment_pending' : 'pending'
    });

    const populated = await appointment.populate([
      { path: 'doctor', select: 'name email phone' },
      { path: 'patient', select: 'name email phone' },
      { path: 'familyMemberId', select: 'fullName relation age gender bloodGroup quickHealthStatus' }
    ]);

    const memberLine = familyMember ? ` for ${familyMember.fullName} (${familyMember.relation})` : '';

    await createDoctorNotification(req.app, {
      doctorId,
      patientId: req.user._id,
      patientName: populated.patient?.name || req.user.name || 'Patient',
      type: 'appointment_booked',
      title: 'New appointment booked',
      message: `${populated.patient?.name || 'A patient'} booked an appointment${memberLine} for ${new Date(populated.scheduledAt).toLocaleString('en-IN')}.${symptomHistory ? ` Symptoms: ${symptomHistory.symptomText || symptomHistory.symptoms.join(', ')}` : ''}`,
      relatedAppointmentId: populated._id
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Could not book appointment.', error: error.message });
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

router.post('/symptoms/analyze', async (req, res) => {
  try {
    const data = await analyzeAndSaveSymptomCheck({
      user: req.user,
      body: req.body
    });

    res.status(201).json({
      message: 'Symptoms analyzed successfully.',
      analysis: data.analysis,
      history: data.history,
      summary: data.summary,
      possibleConditions: data.possibleConditions,
      urgency: data.urgency,
      advice: data.advice,
      nextAction: data.nextAction,
      disclaimer: data.disclaimer
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Could not analyze symptoms.', error: error.message });
  }
});

router.get('/symptoms/history', async (req, res) => {
  try {
    const query = { patient: req.user._id };
    if (req.query.familyMemberId) query.familyMemberId = req.query.familyMemberId;

    const history = await SymptomHistory.find(query)
      .populate('familyMemberId', 'fullName relation')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: 'Could not load symptom history.', error: error.message });
  }
});

router.post('/emergency', async (req, res) => {
  try {
    const { type, message = '' } = req.body;
    const allowed = ['ambulance', 'emergency_contact', 'nearest_hospital', 'quick_alert'];
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: 'Invalid emergency action type.' });
    }

    const emergency = await EmergencyRequest.create({
      patient: req.user._id,
      patientName: req.user.name,
      type,
      status: 'ACTIVE',
      message
    });

    res.status(201).json({ message: 'Emergency request logged.', emergency });
  } catch (error) {
    res.status(500).json({ message: 'Could not log emergency request.', error: error.message });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find({ patient: req.user._id })
      .populate('doctor', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .populate('payment')
      .sort({ scheduledAt: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load appointments.', error: error.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const profile = await PatientProfile.findOne({ user: req.user._id }).populate('user', 'name email phone role');
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Could not load profile.', error: error.message });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const medicalNotes = String(req.body.medicalNotes || '').trim();

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    const emailOwner = await User.findOne({ email, _id: { $ne: req.user._id } }).select('_id');
    if (emailOwner) {
      return res.status(409).json({ message: 'This email is already linked to another account.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, email, phone },
      { new: true, runValidators: true }
    ).select('-password');

    const profile = await PatientProfile.findOneAndUpdate(
      { user: req.user._id },
      { medicalNotes },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate('user', 'name email phone role');

    res.json({
      message: 'Profile updated successfully.',
      user,
      profile
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not update profile.', error: error.message });
  }
});

router.get('/notifications/:patientId', async (req, res) => {
  try {
    if (req.params.patientId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view your own notifications.' });
    }

    const notifications = await PatientNotification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(80);
    const unreadCount = await PatientNotification.countDocuments({ userId: req.user._id, isRead: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Could not load patient notifications.', error: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const payments = await Payment.find({ patientId: req.user._id })
      .populate('doctorId', 'name email phone')
      .populate('appointmentId')
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load payments.', error: error.message });
  }
});

router.get('/prescriptions', async (req, res) => {
  try {
    const query = { patient: req.user._id };
    if (req.query.familyMemberId) {
      const member = await FamilyMember.findOne({ _id: req.query.familyMemberId, userId: req.user._id });
      if (!member) return res.status(404).json({ message: 'Family member not found for this account.' });
      query.familyMemberId = member._id;
    }

    const prescriptions = await Prescription.find(query)
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

router.get('/messages/:doctorId', async (req, res) => {
  try {
    const roomId = req.params.doctorId;
    const messages = await Message.find({
      roomId,
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id }
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
