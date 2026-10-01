const mongoose = require('mongoose');

const chatbotSessionSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['started', 'completed', 'sent_to_doctor', 'emergency_flagged'],
      default: 'started',
      index: true
    },
    preInfo: {
      name: { type: String, trim: true, default: '' },
      age: { type: String, trim: true, default: '' },
      weight: { type: String, trim: true, default: '' },
      gender: { type: String, trim: true, default: '' },
      symptoms: { type: String, trim: true, default: '' },
      duration: { type: String, trim: true, default: '' },
      severity: { type: String, trim: true, default: '' },
      existingDiseases: { type: String, trim: true, default: '' },
      currentMedicines: { type: String, trim: true, default: '' },
      allergies: { type: String, trim: true, default: '' }
    },
    messages: {
      type: [{
        sender: { type: String, enum: ['bot', 'patient'], required: true },
        text: { type: String, trim: true, required: true },
        createdAt: { type: Date, default: Date.now }
      }],
      default: []
    },
    summary: {
      type: String,
      trim: true,
      default: ''
    },
    emergencyFlagged: {
      type: Boolean,
      default: false,
      index: true
    },
    emergencyKeywords: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatbotSession', chatbotSessionSchema);
