const mongoose = require('mongoose');

const patientNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    userRole: {
      type: String,
      enum: ['patient'],
      default: 'patient',
      index: true
    },
    type: {
      type: String,
      enum: [
        'doctor_accepted_case',
        'doctor_sent_message',
        'doctor_joined_consultation',
        'prescription_uploaded',
        'consultation_closed',
        'consultation_reopened',
        'appointment_approved',
        'appointment_rejected',
        'appointment_status',
        'emergency_update',
        'request_declined',
        'request_later'
      ],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    relatedCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientCase',
      default: null,
      index: true
    },
    relatedRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientIntakeRequest',
      default: null,
      index: true
    },
    relatedChatId: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    relatedAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    relatedPrescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      default: null,
      index: true
    },
    relatedEmergencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyRequest',
      default: null,
      index: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PatientNotification', patientNotificationSchema);
