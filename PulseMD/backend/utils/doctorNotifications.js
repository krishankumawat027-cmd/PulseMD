const DoctorNotification = require('../models/DoctorNotification');

async function createDoctorNotification(app, data) {
  const notification = await DoctorNotification.create({
    doctorId: data.doctorId,
    patientId: data.relatedPatientId || data.patientId || null,
    relatedPatientId: data.relatedPatientId || data.patientId || null,
    type: data.type,
    title: data.title,
    message: data.message,
    patientName: data.patientName || '',
    caseId: data.caseId || null,
    symptomSummary: data.symptoms || data.symptomSummary || '',
    urgencyLevel: data.urgencyLevel || '',
    requestId: data.relatedRequestId || data.requestId || null,
    relatedRequestId: data.relatedRequestId || data.requestId || null,
    relatedChatId: data.relatedChatId || '',
    relatedAppointmentId: data.relatedAppointmentId || data.appointmentId || null
  });

  const io = app?.get?.('io');
  if (io) {
    io.to(`doctor-notify:${data.doctorId}`).emit('doctorNotification', {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      relatedPatientId: notification.relatedPatientId,
      relatedRequestId: notification.relatedRequestId,
      relatedChatId: notification.relatedChatId,
      relatedAppointmentId: notification.relatedAppointmentId,
      createdAt: notification.createdAt,
      patientName: notification.patientName || data.patientName || '',
      caseId: notification.caseId || data.caseId || notification.relatedChatId || '',
      urgencyLevel: notification.urgencyLevel || data.urgencyLevel || '',
      symptoms: notification.symptomSummary || data.symptoms || ''
    });
  }

  return notification;
}

module.exports = { createDoctorNotification };
