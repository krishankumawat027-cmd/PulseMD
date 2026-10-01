const express = require('express');
const { authMiddleware, allowRoles } = require('../middleware/auth');
const { Appointment, Notification, Payment } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const query = req.user.role === 'doctor' ? { doctor: req.user._id } : req.user.role === 'patient' ? { patient: req.user._id } : {};
    res.json(await Appointment.find(query).populate('patient doctor', 'name email phone').sort({ scheduledAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/', allowRoles('patient'), async (req, res, next) => {
  try {
    const { doctor, scheduledAt, reason, symptomSummary } = req.body;
    if (!doctor || !scheduledAt) return res.status(400).json({ message: 'Doctor and time slot are required.' });
    const clash = await Appointment.findOne({ doctor, scheduledAt, status: { $in: ['pending', 'confirmed'] } });
    if (clash) return res.status(409).json({ message: 'Slot already booked. Please choose another time.' });
    const appointment = await Appointment.create({ patient: req.user._id, doctor, scheduledAt, reason, symptomSummary, fallbackNote: 'If network fails, retry booking from local pending state.' });
    await Notification.create({ user: doctor, role: 'doctor', type: 'appointment', title: 'New appointment request', message: `${req.user.name} booked a consultation.` });
    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role === 'doctor') query.doctor = req.user._id;
    if (req.user.role === 'patient') query.patient = req.user._id;
    const appointment = await Appointment.findOneAndUpdate(query, req.body, { new: true }).populate('patient doctor', 'name email role');
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pay-demo', allowRoles('patient'), async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    appointment.paymentStatus = 'paid';
    appointment.status = 'confirmed';
    await appointment.save();
    const payment = await Payment.create({ appointment: appointment._id, patient: appointment.patient, doctor: appointment.doctor, amount: req.body.amount || 499, status: 'paid', transactionId: `DEMO-${Date.now()}` });
    res.json({ appointment, payment });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
