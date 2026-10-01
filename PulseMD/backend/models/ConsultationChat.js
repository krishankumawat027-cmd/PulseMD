const mongoose = require('mongoose');

const consultationChatSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMember',
      default: null,
      index: true
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientIntakeRequest',
      default: null,
      index: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    roomId: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['open', 'prescription_sent', 'closed', 'reopened'],
      default: 'open',
      index: true
    },
    aiSummary: {
      type: String,
      trim: true,
      default: ''
    },
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      default: null
    },
    prescriptionSent: {
      type: Boolean,
      default: false,
      index: true
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    },
    reopenedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

consultationChatSchema.index({ patientId: 1, doctorId: 1, appointmentId: 1 }, { unique: false });

module.exports = mongoose.model('ConsultationChat', consultationChatSchema);
