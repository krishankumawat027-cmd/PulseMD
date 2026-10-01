const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    age: {
      type: Number,
      required: true,
      min: 0,
      max: 130
    },
    gender: {
      type: String,
      enum: ['female', 'male', 'other', 'prefer_not_to_say'],
      default: 'prefer_not_to_say'
    },
    relation: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    bloodGroup: {
      type: String,
      trim: true,
      default: ''
    },
    allergies: {
      type: String,
      trim: true,
      default: ''
    },
    chronicDiseases: {
      type: String,
      trim: true,
      default: ''
    },
    currentMedicines: {
      type: String,
      trim: true,
      default: ''
    },
    pastMedicalHistory: {
      type: String,
      trim: true,
      default: ''
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    profilePhotoUrl: {
      type: String,
      trim: true,
      default: ''
    },
    quickHealthStatus: {
      type: String,
      trim: true,
      default: 'Stable'
    },
    isSelf: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

familyMemberSchema.index({ userId: 1, fullName: 1, relation: 1 });

module.exports = mongoose.model('FamilyMember', familyMemberSchema);
