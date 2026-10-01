const express = require('express');
const ChatbotSession = require('../models/ChatbotSession');
const { auth, requireRole } = require('../middleware/auth');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { detectEmergencySymptoms, generateChatbotSummary } = require('../services/chatbotService');

const router = express.Router();

router.post('/start', auth, requireRole('patient'), async (req, res) => {
  try {
    const session = await ChatbotSession.create({
      patientId: req.user._id,
      familyMemberId: req.body.familyMemberId || null,
      doctorId: req.body.doctorId || null,
      appointmentId: req.body.appointmentId || null,
      messages: [{
        sender: 'bot',
        text: 'Hello. I am PulseMD - Virtual Clinic AI Assistant. I will collect basic information before connecting you to a doctor.'
      }]
    });

    res.status(201).json({ message: 'Chatbot session started.', session });
  } catch (error) {
    res.status(500).json({ message: 'Could not start chatbot session.', error: error.message });
  }
});

router.post('/save', auth, requireRole('patient'), async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    const preInfo = req.body.preInfo || {};
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const emergencyKeywords = detectEmergencySymptoms([
      preInfo.symptoms,
      preInfo.existingDiseases,
      ...messages.map((item) => item.text)
    ].join(' '));
    const emergencyFlagged = emergencyKeywords.length > 0;

    const session = sessionId
      ? await ChatbotSession.findOne({ _id: sessionId, patientId: req.user._id })
      : new ChatbotSession({ patientId: req.user._id });

    if (!session) return res.status(404).json({ message: 'Chatbot session not found.' });

    session.doctorId = req.body.doctorId || session.doctorId || null;
    session.familyMemberId = req.body.familyMemberId || session.familyMemberId || null;
    session.appointmentId = req.body.appointmentId || session.appointmentId || null;
    session.preInfo = {
      name: String(preInfo.name || '').trim(),
      age: String(preInfo.age || '').trim(),
      weight: String(preInfo.weight || '').trim(),
      gender: String(preInfo.gender || '').trim(),
      symptoms: String(preInfo.symptoms || '').trim(),
      duration: String(preInfo.duration || '').trim(),
      severity: String(preInfo.severity || '').trim(),
      existingDiseases: String(preInfo.existingDiseases || '').trim(),
      currentMedicines: String(preInfo.currentMedicines || '').trim(),
      allergies: String(preInfo.allergies || '').trim()
    };
    session.messages = messages
      .filter((item) => item?.sender && item?.text)
      .map((item) => ({
        sender: item.sender === 'patient' ? 'patient' : 'bot',
        text: String(item.text || '').trim(),
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
      }));
    session.summary = req.body.summary || generateChatbotSummary(session.preInfo);
    session.emergencyFlagged = emergencyFlagged;
    session.emergencyKeywords = emergencyKeywords;
    session.status = emergencyFlagged ? 'emergency_flagged' : 'completed';
    await session.save();

    if (session.doctorId) {
      await createDoctorNotification(req.app, {
        doctorId: session.doctorId,
        patientId: req.user._id,
        patientName: req.user.name || session.preInfo.name || 'Patient',
        type: emergencyFlagged ? 'emergency_alert' : 'new_patient_case',
        title: emergencyFlagged ? 'Urgent symptoms detected' : 'AI chatbot summary received',
        message: emergencyFlagged
          ? 'PulseMD - Virtual Clinic AI detected symptoms that may need urgent medical attention.'
          : 'A patient completed the AI pre-consultation chatbot summary.',
        relatedChatId: session._id.toString(),
        symptomSummary: session.preInfo.symptoms,
        urgencyLevel: emergencyFlagged ? 'Severe' : session.preInfo.severity
      });
    }

    res.json({
      message: emergencyFlagged
        ? 'Chatbot session saved with urgent symptom warning.'
        : 'Chatbot session saved.',
      session,
      emergencyFlagged,
      emergencyKeywords
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not save chatbot session.', error: error.message });
  }
});

router.get('/summary/:id', auth, async (req, res) => {
  try {
    const session = await ChatbotSession.findById(req.params.id)
      .populate('patientId', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .populate('doctorId', 'name email phone');
    if (!session) return res.status(404).json({ message: 'Chatbot session not found.' });

    const userId = req.user._id.toString();
    const allowed = req.user.role === 'admin'
      || session.patientId?._id?.toString() === userId
      || session.doctorId?._id?.toString() === userId;
    if (!allowed) return res.status(403).json({ message: 'You cannot view this chatbot summary.' });

    res.json(session);
  } catch (error) {
    res.status(500).json({ message: 'Could not load chatbot summary.', error: error.message });
  }
});

module.exports = router;
