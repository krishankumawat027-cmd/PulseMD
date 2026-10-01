const express = require('express');
const DoctorNotification = require('../models/DoctorNotification');
const PatientNotification = require('../models/PatientNotification');
const { auth } = require('../middleware/auth');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { createPatientNotification } = require('../utils/patientNotifications');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'doctor') {
      const notifications = await DoctorNotification.find({ doctorId: req.user._id })
        .populate('requestId')
        .populate('relatedRequestId')
        .populate('caseId')
        .populate('patientId', 'name email phone')
        .populate('relatedPatientId', 'name email phone')
        .populate({
          path: 'relatedAppointmentId',
          populate: { path: 'patient', select: 'name email phone' }
        })
        .sort({ createdAt: -1 })
        .limit(80);
      const unreadCount = await DoctorNotification.countDocuments({ doctorId: req.user._id, isRead: false });
      return res.json({ notifications, unreadCount });
    }

    if (req.user.role === 'patient') {
      const notifications = await PatientNotification.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(80);
      const unreadCount = await PatientNotification.countDocuments({ userId: req.user._id, isRead: false });
      return res.json({ notifications, unreadCount });
    }

    return res.status(403).json({ message: 'Notifications are available for patients and doctors only.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not load notifications.', error: error.message });
  }
});

router.post('/create', auth, async (req, res) => {
  try {
    const {
      doctorId,
      patientId,
      caseId,
      requestId,
      userRole,
      type = 'new_patient_case',
      title = 'New patient case received',
      message = 'A new AI-screened patient is waiting for doctor review'
    } = req.body;

    if (userRole === 'patient' || req.body.userId) {
      const targetPatientId = req.body.userId || patientId || req.user._id;
      if (req.user.role === 'patient' && targetPatientId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only create notifications for yourself.' });
      }

      const notification = await createPatientNotification(req.app, {
        userId: targetPatientId,
        type,
        title,
        message,
        relatedCaseId: caseId || null,
        relatedRequestId: requestId || null,
        relatedChatId: req.body.relatedChatId || req.body.chatId || '',
        relatedAppointmentId: req.body.relatedAppointmentId || req.body.appointmentId || null,
        relatedPrescriptionId: req.body.relatedPrescriptionId || req.body.prescriptionId || null
      });

      return res.status(201).json(notification);
    }

    if (!doctorId) return res.status(400).json({ message: 'doctorId is required.' });

    const notification = await createDoctorNotification(req.app, {
      doctorId,
      patientId: patientId || req.user._id,
      relatedPatientId: patientId || req.user._id,
      type,
      title,
      message,
      requestId: requestId || null,
      relatedRequestId: requestId || null,
      relatedChatId: caseId || '',
      patientName: req.user.name
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error('Could not create notification:', error);
    res.status(500).json({ message: 'Could not create notification.', error: error.message });
  }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role === 'doctor') query.doctorId = req.user._id;
    if (req.user.role === 'patient') query.userId = req.user._id;

    const Model = req.user.role === 'patient' ? PatientNotification : DoctorNotification;
    const notification = await Model.findOneAndUpdate(
      query,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ ok: true, notification });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark notification read.', error: error.message });
  }
});

router.patch('/read-all/:patientId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Only patients can use this endpoint.' });
    }

    if (req.params.patientId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own notifications.' });
    }

    await PatientNotification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark notifications read.', error: error.message });
  }
});

module.exports = router;
