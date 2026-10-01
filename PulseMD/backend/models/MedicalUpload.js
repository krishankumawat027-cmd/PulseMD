const mongoose = require('mongoose');

const medicalUploadSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ownerRole: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['report', 'prescription', 'profile', 'verification', 'other'],
      default: 'other',
      index: true
    },
    fileName: {
      type: String,
      trim: true,
      default: ''
    },
    mimeType: {
      type: String,
      trim: true,
      default: ''
    },
    publicId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    resourceType: {
      type: String,
      trim: true,
      default: 'auto'
    },
    bytes: {
      type: Number,
      default: 0
    },
    relatedPatientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMember',
      default: null,
      index: true
    },
    relatedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    relatedPrescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      default: null,
      index: true
    },
    relatedAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MedicalUpload', medicalUploadSchema);
