const express = require('express');
const { authMiddleware, patientMiddleware } = require('../middleware/auth');
const { PatientProfile, Appointment, Prescription, Report, AIUsageLog } = require('../models');

const router = express.Router();

router.get('/me', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    res.json(await PatientProfile.findOne({ user: req.user._id }).populate('user', 'name email phone role'));
  } catch (error) {
    next(error);
  }
});

router.patch('/me', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    const profile = await PatientProfile.findOneAndUpdate({ user: req.user._id }, req.body, { new: true, upsert: true });
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/appointments', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    res.json(await Appointment.find({ patient: req.user._id }).populate('doctor', 'name email phone').sort({ scheduledAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/prescriptions', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    res.json(await Prescription.find({ patient: req.user._id }).populate('doctor', 'name email').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/reports', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    res.json(await Report.find({ patient: req.user._id }).sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/ai-history', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    res.json(await AIUsageLog.find({ patient: req.user._id }).sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
