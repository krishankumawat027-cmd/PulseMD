const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { Payment } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const query = req.user.role === 'patient' ? { patient: req.user._id } : req.user.role === 'doctor' ? { doctor: req.user._id } : {};
    res.json(await Payment.find(query).populate('patient doctor appointment', 'name email scheduledAt').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/demo', async (req, res, next) => {
  try {
    const payment = await Payment.create({ ...req.body, patient: req.body.patient || req.user._id, status: 'paid', transactionId: `DEMO-${Date.now()}` });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
