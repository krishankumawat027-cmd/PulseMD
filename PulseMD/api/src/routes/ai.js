const express = require('express');
const { authMiddleware, patientMiddleware } = require('../middleware/auth');
const { AIUsageLog, Notification } = require('../models');

const router = express.Router();

function analyze(symptomsText = '') {
  const text = symptomsText.toLowerCase();
  const high = ['chest pain', 'breathing', 'unconscious', 'severe', 'bleeding'].some((word) => text.includes(word));
  const medium = ['fever', 'vomit', 'pain', 'cough', 'headache'].some((word) => text.includes(word));
  return {
    summary: symptomsText ? `Patient reports: ${symptomsText}` : 'No symptoms provided.',
    urgency: high ? 'high' : medium ? 'medium' : 'low',
    possibleConditions: high ? ['Emergency condition', 'Cardiac or respiratory concern'] : medium ? ['Viral infection', 'General illness', 'Inflammation'] : ['Routine health concern'],
    advice: high ? 'Seek urgent medical care or call emergency services.' : 'Book a consultation if symptoms persist or worsen.'
  };
}

router.post('/analyze', authMiddleware, patientMiddleware, async (req, res, next) => {
  try {
    const symptomsText = String(req.body.symptomsText || '').trim().slice(0, 2000);
    if (!symptomsText) return res.status(400).json({ message: 'Symptoms text is required.' });
    const result = analyze(symptomsText);
    const log = await AIUsageLog.create({ patient: req.user._id, symptomsText, language: req.body.language || 'en', ...result });
    if (req.body.doctor) {
      await Notification.create({ user: req.body.doctor, role: 'doctor', type: 'ai_summary', title: 'AI symptom summary', message: result.summary });
      log.sentToDoctor = true;
      await log.save();
    }
    res.json({ ...result, log });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
