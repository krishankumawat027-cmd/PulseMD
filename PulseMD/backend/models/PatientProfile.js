const mongoose = require('mongoose');

const patientProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    age: {
      type: Number,
      min: 0,
      default: null
    },
    gender: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    medicalNotes: {
      type: String,
      trim: true,
      default: ''
    },
    emergencyContact: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        name: '',
        phone: '',
        updatedAt: null
      })
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PatientProfile', patientProfileSchema);
