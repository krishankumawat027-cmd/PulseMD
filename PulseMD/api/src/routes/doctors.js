const express = require('express');
const { authMiddleware, doctorMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { DoctorProfile, Appointment, Prescription, Report, Payment, Notification } = require('../models');

const router = express.Router();

router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const doctors = await DoctorProfile.find({ status: { $ne: 'suspended' } }).populate('user', 'name email phone').sort({ rating: -1 });
    res.json(doctors);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    res.json(await DoctorProfile.findOne({ user: req.user._id }).populate('user', 'name email phone role'));
  } catch (error) {
    next(error);
  }
});

router.patch('/me', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    const profile = await DoctorProfile.findOneAndUpdate({ user: req.user._id }, req.body, { new: true, upsert: true }).populate('user', 'name email phone');
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.post('/documents', authMiddleware, doctorMiddleware, upload.array('files', 5), async (req, res, next) => {
  try {
    const documents = (req.files || []).map((file) => ({ name: file.originalname, url: `/uploads/${file.filename}`, mimeType: file.mimetype }));
    const profile = await DoctorProfile.findOneAndUpdate(
      { user: req.user._id },
      { $push: { documents: { $each: documents } }, status: 'pending' },
      { new: true, upsert: true }
    );
    res.status(201).json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/appointments', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    res.json(await Appointment.find({ doctor: req.user._id }).populate('patient', 'name email phone').sort({ scheduledAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.patch('/appointments/:id', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    const appointment = await Appointment.findOneAndUpdate({ _id: req.params.id, doctor: req.user._id }, req.body, { new: true }).populate('patient doctor', 'name email');
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    await Notification.create({ user: appointment.patient._id, role: 'patient', type: 'appointment', title: 'Appointment updated', message: `Appointment status: ${appointment.status}` });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

router.post('/prescriptions', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    const prescription = await Prescription.create({ ...req.body, doctor: req.user._id });
    await Notification.create({ user: prescription.patient, role: 'patient', type: 'prescription', title: 'Prescription ready', message: 'Your doctor uploaded a prescription.' });
    res.status(201).json(prescription);
  } catch (error) {
    next(error);
  }
});

router.get('/reports', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    res.json(await Report.find({ doctor: req.user._id }).populate('patient', 'name email').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/earnings', authMiddleware, doctorMiddleware, async (req, res, next) => {
  try {
    const payments = await Payment.find({ doctor: req.user._id }).sort({ createdAt: -1 });
    res.json({ total: payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0), payments });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
