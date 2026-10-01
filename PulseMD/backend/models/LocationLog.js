const mongoose = require('mongoose');

const locationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    userRole: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      required: true,
      index: true
    },
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    accuracy: {
      type: Number,
      default: null
    },
    source: {
      type: String,
      enum: ['emergency', 'profile', 'chat', 'manual'],
      default: 'manual',
      index: true
    },
    relatedEmergencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyRequest',
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('LocationLog', locationLogSchema);
