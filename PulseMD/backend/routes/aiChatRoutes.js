const express = require('express');
const PatientCase = require('../models/PatientCase');
const { auth, requireRole } = require('../middleware/auth');
const { createPatientCaseWithNotifications, makeAiSummary } = require('../utils/patientCases');

const router = express.Router();

function cleanPreInfo(body = {}) {
  const source = body.preInfo || body;
  return {
    name: String(source.name || '').trim(),
    age: String(source.age || '').trim(),
    weight: String(source.weight || '').trim(),
    gender: String(source.gender || '').trim(),
    symptoms: String(source.symptoms || '').trim(),
    duration: String(source.duration || '').trim(),
    severity: String(source.severity || '').trim(),
    currentMedicines: String(source.currentMedicines || source.medicines || '').trim()
  };
}

router.post('/save-case', auth, requireRole('patient'), async (req, res) => {
  try {
    const preInfo = cleanPreInfo(req.body);
    const { doctorId, appointmentId, familyMemberId = null, preferredSpecialty = '', chatMessages = [], medicalNotes = '' } = req.body;

    if (!preInfo.name || !preInfo.age || !preInfo.weight || !preInfo.gender || !preInfo.symptoms || !preInfo.duration || !preInfo.severity || !preInfo.currentMedicines) {
      return res.status(400).json({ message: 'Please complete all AI assistant questions before sending to doctor.' });
    }

    if (!['Mild', 'Moderate', 'Severe'].includes(preInfo.severity)) {
      return res.status(400).json({ message: 'Severity must be Mild, Moderate, or Severe.' });
    }

    if (appointmentId) {
      const existingCase = await PatientCase.findOne({
        patientId: req.user._id,
        appointmentId,
        status: { $in: ['pending', 'in-progress'] }
      }).sort({ createdAt: -1 });

      if (existingCase) {
        return res.status(200).json({
          message: 'Your AI-screened case is already saved and waiting for doctor review.',
          case: existingCase,
          request: null,
          notifications: [],
          duplicate: true,
          noDoctorAvailable: !existingCase.notificationSent
        });
      }
    }

    const result = await createPatientCaseWithNotifications(req.app, {
      patient: req.user,
      doctorId: doctorId || null,
      appointmentId: appointmentId || null,
      familyMemberId: familyMemberId || null,
      preInfo,
      preferredSpecialty,
      medicalNotes,
      chatMessages,
      aiSummary: req.body.aiSummary || makeAiSummary(preInfo)
    });

    const noDoctorAvailable = !result.patientCase.notifiedDoctors.length;
    res.status(201).json({
      message: noDoctorAvailable
        ? 'Your case has been saved in the pending queue. A doctor will be notified when available.'
        : 'Your AI-screened case has been sent to the doctor.',
      case: result.patientCase,
      request: result.intakeRequest,
      notifications: result.notifications,
      noDoctorAvailable
    });
  } catch (error) {
    console.error('Could not save AI patient case:', error);
    res.status(500).json({ message: 'Could not save AI patient case.', error: error.message });
  }
});

module.exports = router;
