const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { analyzeAndSaveSymptomCheck } = require('../utils/symptomChecker');

const router = express.Router();

router.use(auth, requireRole('patient'));

router.post('/analyze', async (req, res) => {
  try {
    const data = await analyzeAndSaveSymptomCheck({
      user: req.user,
      body: req.body
    });

    res.status(201).json({
      message: 'Symptoms analyzed successfully.',
      patientId: data.patientId,
      symptomsText: data.enteredSymptoms,
      language: data.language,
      summary: data.summary,
      possibleConditions: data.possibleConditions,
      urgency: data.urgency,
      advice: data.advice,
      nextAction: data.nextAction,
      analysis: data.analysis,
      history: data.history,
      disclaimer: data.disclaimer
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Could not analyze symptoms.',
      error: error.status ? undefined : error.message
    });
  }
});

module.exports = router;
