const express = require('express');
const PatientIntakeRequest = require('../models/PatientIntakeRequest');
const { auth, requireRole } = require('../middleware/auth');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { createPatientCaseWithNotifications } = require('../utils/patientCases');

const router = express.Router();

function cleanPreInfo(preInfo = {}) {
  return {
    name: String(preInfo.name || '').trim(),
    age: String(preInfo.age || '').trim(),
    weight: String(preInfo.weight || '').trim(),
    gender: String(preInfo.gender || '').trim(),
    symptoms: String(preInfo.symptoms || '').trim(),
    duration: String(preInfo.duration || '').trim(),
    severity: String(preInfo.severity || '').trim(),
    currentMedicines: String(preInfo.currentMedicines || preInfo.medicines || '').trim()
  };
}

function makeAiSummary(info) {
  const weightText = info.weight ? `, weight ${info.weight}` : '';
  const medicinesText = info.currentMedicines ? ` Current medicines: ${info.currentMedicines}.` : '';
  return `Patient ${info.name}, age ${info.age}${weightText}, reports ${info.symptoms} for ${info.duration}. Severity marked as ${info.severity}.${medicinesText} Doctor review required.`;
}

router.post('/', auth, requireRole('patient'), async (req, res) => {
  try {
    const { doctorId, appointmentId } = req.body;
    const info = cleanPreInfo(req.body.preInfo || req.body);

    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor is required for AI intake.' });
    }

    if (!info.name || !info.age || !info.weight || !info.gender || !info.symptoms || !info.duration || !info.severity || !info.currentMedicines) {
      return res.status(400).json({ message: 'Please complete all AI assistant questions.' });
    }

    if (!['Mild', 'Moderate', 'Severe'].includes(info.severity)) {
      return res.status(400).json({ message: 'Severity must be Mild, Moderate, or Severe.' });
    }

    const aiSummary = makeAiSummary(info);
    const result = await createPatientCaseWithNotifications(req.app, {
      patient: req.user,
      doctorId,
      appointmentId: appointmentId || null,
      preInfo: info,
      aiSummary,
      chatMessages: req.body.chatMessages || [],
      preferredSpecialty: req.body.preferredSpecialty || ''
    });

    const request = result.intakeRequest;
    const notification = result.notifications[0] || null;

    res.status(201).json({
      message: 'Your details have been sent to the doctor.',
      case: result.patientCase,
      request,
      notification
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not create AI intake request.', error: error.message });
  }
});

module.exports = router;
