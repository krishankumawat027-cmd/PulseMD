const mongoose = require('mongoose');

const symptomHistorySchema = new mongoose.Schema(
  {
    patient: {
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
      trim: true,
      default: ''
    },
    symptoms: {
      type: [String],
      default: []
    },
    symptomText: {
      type: String,
      trim: true,
      default: ''
    },
    suggestedSpecialty: {
      type: String,
      trim: true,
      default: 'General Physician'
    },
    suggestedDepartments: {
      type: [String],
      default: []
    },
    careAdvice: {
      type: [String],
      default: []
    },
    urgencyLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Low',
      index: true
    },
    disclaimer: {
      type: String,
      trim: true,
      default: 'This AI suggestion is not a final medical diagnosis. Please consult a qualified doctor.'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SymptomHistory', symptomHistorySchema);
