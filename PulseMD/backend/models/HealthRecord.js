const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMember',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['report', 'lab_report', 'document', 'image', 'prescription', 'doctor_note'],
      default: 'report',
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    notes: {
      type: String,
      trim: true,
      default: ''
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
    fileUrl: {
      type: String,
      required: true,
      trim: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

healthRecordSchema.index({ userId: 1, familyMemberId: 1, createdAt: -1 });

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
