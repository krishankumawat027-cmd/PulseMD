const mongoose = require('mongoose');

const patientIntakeRequestSchema = new mongoose.Schema(
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
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: String,
      required: true,
      trim: true
    },
    weight: {
      type: String,
      trim: true,
      default: ''
    },
    gender: {
      type: String,
      required: true,
      trim: true
    },
    symptoms: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: String,
      required: true,
      trim: true
    },
    severity: {
      type: String,
      enum: ['Mild', 'Moderate', 'Severe'],
      required: true,
      index: true
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
    status: {
      type: String,
      enum: ['waiting', 'joined', 'declined', 'later'],
      default: 'waiting',
      index: true
    },
    joinedAt: {
      type: Date,
      default: null
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PatientCase',
      default: null,
      index: true
    },
    aiChatMessages: {
      type: [
        {
          sender: { type: String, trim: true, default: '' },
          text: { type: String, trim: true, default: '' },
          step: { type: String, trim: true, default: '' },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    preferredSpecialty: {
      type: String,
      trim: true,
      default: ''
    },
    urgencyLevel: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PatientIntakeRequest', patientIntakeRequestSchema);
