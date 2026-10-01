const PatientNotification = require('../models/PatientNotification');

async function createPatientNotification(app, data) {
  if (!data.userId && !data.patientId) return null;

  const payload = {
    userId: data.userId || data.patientId,
    userRole: 'patient',
    type: data.type,
    title: data.title,
    message: data.message,
    relatedCaseId: data.relatedCaseId || data.caseId || null,
    relatedRequestId: data.relatedRequestId || data.requestId || null,
    relatedChatId: data.relatedChatId || data.chatId || '',
    relatedAppointmentId: data.relatedAppointmentId || data.appointmentId || null,
    relatedPrescriptionId: data.relatedPrescriptionId || data.prescriptionId || null,
    relatedEmergencyId: data.relatedEmergencyId || data.emergencyId || null
  };

  if (data.type !== 'doctor_sent_message') {
    const duplicateQuery = {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message
    };
    if (payload.relatedCaseId) duplicateQuery.relatedCaseId = payload.relatedCaseId;
    if (payload.relatedRequestId) duplicateQuery.relatedRequestId = payload.relatedRequestId;
    if (payload.relatedAppointmentId) duplicateQuery.relatedAppointmentId = payload.relatedAppointmentId;
    if (payload.relatedPrescriptionId) duplicateQuery.relatedPrescriptionId = payload.relatedPrescriptionId;
    if (payload.relatedEmergencyId) duplicateQuery.relatedEmergencyId = payload.relatedEmergencyId;
    if (Object.keys(duplicateQuery).length > 2) {
      const existing = await PatientNotification.findOne(duplicateQuery).sort({ createdAt: -1 });
      if (existing) return existing;
    }
  }

  const notification = await PatientNotification.create(payload);

  const io = app?.get?.('io');
  if (io) {
    io.to(`patient_${notification.userId}`).emit('patientNotification', {
      _id: notification._id,
      userId: notification.userId,
      userRole: notification.userRole,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedCaseId: notification.relatedCaseId,
      relatedRequestId: notification.relatedRequestId,
      relatedChatId: notification.relatedChatId,
      relatedAppointmentId: notification.relatedAppointmentId,
      relatedPrescriptionId: notification.relatedPrescriptionId,
      relatedEmergencyId: notification.relatedEmergencyId,
      isRead: notification.isRead,
      createdAt: notification.createdAt
    });
  }

  return notification;
}

module.exports = { createPatientNotification };
