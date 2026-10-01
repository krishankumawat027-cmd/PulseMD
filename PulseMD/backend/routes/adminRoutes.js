const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');
const PatientProfile = require('../models/PatientProfile');
const Appointment = require('../models/Appointment');
const EmergencyRequest = require('../models/EmergencyRequest');
const Payment = require('../models/Payment');
const MedicalUpload = require('../models/MedicalUpload');
const SymptomHistory = require('../models/SymptomHistory');

const router = express.Router();

router.use(auth, requireRole('admin'));

function compactUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    specialty: user.specialty,
    consultationFee: user.consultationFee,
    createdAt: user.createdAt
  };
}

router.get('/overview', async (req, res) => {
  try {
    const [
      totalDoctors,
      totalPatients,
      pendingDoctors,
      appointments,
      emergencyAlerts,
      uploads,
      aiChecks,
      revenue
    ] = await Promise.all([
      User.countDocuments({ role: 'doctor' }),
      User.countDocuments({ role: 'patient' }),
      DoctorProfile.countDocuments({ verificationStatus: { $ne: 'verified' } }),
      Appointment.countDocuments(),
      EmergencyRequest.countDocuments({ status: { $in: ['ACTIVE', 'initiated'] } }),
      MedicalUpload.countDocuments(),
      SymptomHistory.countDocuments(),
      Payment.aggregate([
        { $match: { status: { $in: ['paid', 'success', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const recentAppointments = await Appointment.find()
      .populate('patient doctor', 'name email role')
      .sort({ createdAt: -1 })
      .limit(6);

    const recentEmergencies = await EmergencyRequest.find()
      .populate('patient handledBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(6);

    res.json({
      cards: {
        totalDoctors,
        totalPatients,
        pendingDoctors,
        appointments,
        emergencyAlerts,
        uploads,
        aiChecks,
        revenue: revenue[0]?.total || 0
      },
      recentAppointments,
      recentEmergencies
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load admin overview.', error: error.message });
  }
});

router.get('/doctors', async (req, res) => {
  try {
    const profiles = await DoctorProfile.find()
      .populate('user', 'name email phone role specialty consultationFee createdAt')
      .sort({ createdAt: -1 });

    res.json(profiles.map((profile) => ({
      _id: profile._id,
      user: compactUser(profile.user),
      specialization: profile.specialization,
      city: profile.city,
      clinic: profile.clinic,
      fee: profile.fee,
      experienceYears: profile.experienceYears,
      isVerified: profile.isVerified,
      verificationStatus: profile.verificationStatus,
      verificationMessage: profile.verificationMessage,
      registrationNumber: profile.registrationNumber,
      createdAt: profile.createdAt
    })));
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctors.', error: error.message });
  }
});

router.patch('/doctors/:id/verification', async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['verified', 'pending_review', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid verification status.' });
    }

    const profile = await DoctorProfile.findByIdAndUpdate(
      req.params.id,
      {
        verificationStatus: status,
        isVerified: status === 'verified',
        verificationMessage: req.body.message || (status === 'verified' ? 'Doctor approved by admin.' : status === 'rejected' ? 'Doctor rejected by admin.' : 'Verification pending review.'),
        verificationReviewedAt: new Date(),
        verifiedAt: status === 'verified' ? new Date() : null
      },
      { new: true }
    ).populate('user', 'name email phone role specialty consultationFee createdAt');

    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Could not update doctor verification.', error: error.message });
  }
});

router.get('/patients', async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' }).select('-password').sort({ createdAt: -1 });
    const profiles = await PatientProfile.find({ user: { $in: patients.map((patient) => patient._id) } });
    const profileMap = new Map(profiles.map((profile) => [String(profile.user), profile]));

    res.json(patients.map((patient) => ({
      ...compactUser(patient),
      profile: profileMap.get(String(patient._id)) || null
    })));
  } catch (error) {
    res.status(500).json({ message: 'Could not load patients.', error: error.message });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const allowed = {};
    ['name', 'phone', 'specialty', 'consultationFee'].forEach((field) => {
      if (req.body[field] !== undefined) allowed[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.params.id, allowed, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Could not update user.', error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'Admin cannot delete own account from this panel.' });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    await Promise.all([
      DoctorProfile.deleteOne({ user: user._id }),
      PatientProfile.deleteOne({ user: user._id })
    ]);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete user.', error: error.message });
  }
});

router.get('/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('patient doctor', 'name email phone role')
      .sort({ scheduledAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load appointments.', error: error.message });
  }
});

router.patch('/appointments/:id', async (req, res) => {
  try {
    const allowed = {};
    ['status', 'paymentStatus', 'scheduledAt', 'reason'].forEach((field) => {
      if (req.body[field] !== undefined) allowed[field] = req.body[field];
    });
    if (allowed.status === 'completed') allowed.completedAt = new Date();
    if (allowed.status === 'cancelled') allowed.cancelledAt = new Date();

    const appointment = await Appointment.findByIdAndUpdate(req.params.id, allowed, { new: true })
      .populate('patient doctor', 'name email phone role');
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Could not update appointment.', error: error.message });
  }
});

router.get('/emergencies', async (req, res) => {
  try {
    const emergencies = await EmergencyRequest.find()
      .populate('patient handledBy', 'name email phone role')
      .sort({ createdAt: -1 });
    res.json(emergencies);
  } catch (error) {
    res.status(500).json({ message: 'Could not load emergency alerts.', error: error.message });
  }
});

router.patch('/emergencies/:id', async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!['ACTIVE', 'RESOLVED', 'HANDLED', 'CLOSED', 'CANCELLED', 'initiated', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid emergency status.' });
    }

    const update = { status };
    if (['RESOLVED', 'HANDLED', 'completed'].includes(status)) {
      update.handledBy = req.user._id;
      update.handledAt = new Date();
    }
    if (['CLOSED', 'CANCELLED', 'cancelled'].includes(status)) {
      update.closedAt = new Date();
    }

    const emergency = await EmergencyRequest.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patient handledBy', 'name email phone role');
    if (!emergency) return res.status(404).json({ message: 'Emergency alert not found.' });
    res.json(emergency);
  } catch (error) {
    res.status(500).json({ message: 'Could not update emergency alert.', error: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    res.json(await Payment.find().sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    res.status(500).json({ message: 'Could not load payments.', error: error.message });
  }
});

router.get('/uploads', async (req, res) => {
  try {
    const uploads = await MedicalUpload.find()
      .populate('owner relatedPatientId relatedDoctorId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(uploads);
  } catch (error) {
    res.status(500).json({ message: 'Could not load uploads.', error: error.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [usersByRole, appointmentsByStatus, paymentsByStatus, aiByUrgency] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$amount' } } }]),
      SymptomHistory.aggregate([{ $group: { _id: '$urgencyLevel', count: { $sum: 1 } } }])
    ]);

    res.json({ usersByRole, appointmentsByStatus, paymentsByStatus, aiByUrgency, windowStart: since });
  } catch (error) {
    res.status(500).json({ message: 'Could not load analytics.', error: error.message });
  }
});

module.exports = router;
