const express = require('express');
const PatientProfile = require('../models/PatientProfile');
const { auth } = require('../middleware/auth');
const { sendSms } = require('../utils/smsService');

const router = express.Router();

async function sendSmsFromBody(req, res) {
  try {
    const to = String(req.body.to || req.body.numbers || '').trim();
    const message = String(req.body.message || '').trim();

    if (!to || !message) {
      return res.status(400).json({ message: 'Phone number and message are required.' });
    }

    const result = await sendSms({ to, message });
    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Could not send SMS.', error: error.message });
  }
}

router.use(auth);

router.post('/send', sendSmsFromBody);

router.post('/emergency-contact', async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Only patients can send emergency contact SMS.' });
    }

    const profile = await PatientProfile.findOne({ user: req.user._id });
    const contact = typeof profile?.emergencyContact === 'string'
      ? { phone: profile.emergencyContact }
      : profile?.emergencyContact || {};

    if (!contact.phone) {
      return res.status(400).json({ message: 'No emergency contact phone is saved.' });
    }

    const text = String(req.body.message || `Emergency alert from ${req.user.name || 'PulseMD - Virtual Clinic patient'}. Please contact them immediately.`).trim();
    const result = await sendSms({ to: contact.phone, message: text });
    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Could not send emergency SMS.', error: error.message });
  }
});

module.exports = router;
