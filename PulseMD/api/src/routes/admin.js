const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { User, DoctorProfile, Appointment, EmergencyAlert, Payment, Report, Notification, AIUsageLog } = require('../models');
const toCSV = require('../utils/csv');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [patients, doctors, appointments, emergencies, revenue, aiUsage] = await Promise.all([
      User.countDocuments({ role: 'patient' }),
      User.countDocuments({ role: 'doctor' }),
      Appointment.countDocuments(),
      EmergencyAlert.countDocuments({ status: 'open' }),
      Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      AIUsageLog.countDocuments()
    ]);
    res.json({ patients, doctors, appointments, emergencies, revenue: revenue[0]?.total || 0, aiUsage });
  } catch (error) {
    next(error);
  }
});

router.get('/doctors', async (req, res, next) => {
  try {
    res.json(await DoctorProfile.find().populate('user', 'name email phone role isActive').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.patch('/doctors/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(status)) return res.status(400).json({ message: 'Invalid doctor status.' });
    const profile = await DoctorProfile.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('user', 'name email role');
    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });
    await Notification.create({ user: profile.user._id, role: 'doctor', type: 'verification', title: `Verification ${status}`, message: `Your doctor profile is ${status}.` });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/patients', async (req, res, next) => {
  try {
    res.json(await User.find({ role: 'patient' }).select('-password').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/appointments', async (req, res, next) => {
  try {
    res.json(await Appointment.find().populate('patient doctor', 'name email').sort({ scheduledAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/emergencies', async (req, res, next) => {
  try {
    res.json(await EmergencyAlert.find().populate('patient assignedDoctor', 'name phone email').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/reports', async (req, res, next) => {
  try {
    res.json(await Report.find().populate('patient doctor', 'name email').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/settings', (req, res) => {
  res.json({ appName: 'PulseMD - Virtual Clinic', tagline: 'Healthcare that comes to you', languages: ['en', 'hi'], emergencyNumber: '108' });
});

router.get('/export/:type.csv', async (req, res, next) => {
  try {
    const map = {
      users: () => User.find().select('name email role phone createdAt').lean(),
      appointments: () => Appointment.find().populate('patient doctor', 'name email').lean(),
      payments: () => Payment.find().lean(),
      ai: () => AIUsageLog.find().lean()
    };
    const load = map[req.params.type];
    if (!load) return res.status(404).json({ message: 'Unknown export type.' });
    const rows = await load();
    res.header('Content-Type', 'text/csv');
    res.attachment(`${req.params.type}.csv`);
    res.send(toCSV(rows.map((row) => JSON.parse(JSON.stringify(row)))));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
