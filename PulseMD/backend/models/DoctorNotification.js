const mongoose = require('mongoose');

const doctorNotificationSchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    relatedPatientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: [
        'new_patient_request',
        'new_patient_case',
        'new_chat_request',
        'patient_sent_message',
        'appointment_booked',
        'appointment_cancelled',
        'payment_received',
        'followup_request',
        'prescription_required',
        'chat_join_request',
        'emergency_alert'
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
    patientName: {
      type: String,
      trim: true,
      default: ''
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientCase',
      default: null,
      index: true
    },
    symptomSummary: {
      type: String,
      trim: true,
      default: ''
    },
    urgencyLevel: {
      type: String,
      trim: true,
      default: ''
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientIntakeRequest',
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

module.exports = mongoose.model('DoctorNotification', doctorNotificationSchema);
