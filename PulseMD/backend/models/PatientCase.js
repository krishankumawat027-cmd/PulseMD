const mongoose = require('mongoose');

const aiChatMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['bot', 'patient', 'system'],
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    step: {
      type: String,
      trim: true,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const patientCaseSchema = new mongoose.Schema(
  {
    patientId: {
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
    patientName: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: String,
      trim: true,
      default: ''
    },
    weight: {
      type: String,
      trim: true,
      default: ''
    },
    gender: {
      type: String,
      trim: true,
      default: ''
    },
    symptoms: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: String,
      trim: true,
      default: ''
    },
    severity: {
      type: String,
      enum: ['Mild', 'Moderate', 'Severe'],
      default: 'Mild',
      index: true
    },
    urgencyLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
      index: true
    },
    preferredSpecialty: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    medicalNotes: {
      type: String,
      trim: true,
      default: ''
    },
    currentMedicines: {
      type: String,
      trim: true,
      default: ''
    },
    aiSummary: {
      type: String,
      required: true,
      trim: true
    },
    aiChatMessages: {
      type: [aiChatMessageSchema],
      default: []
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    doctorAssigned: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    notifiedDoctors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
      }
    ],
    intakeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientIntakeRequest',
      default: null,
      index: true
    },
    notificationSent: {
      type: Boolean,
      default: false,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'closed', 'declined', 'later'],
      default: 'pending',
      index: true
    },
    startedAt: {
      type: Date,
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PatientCase', patientCaseSchema);
