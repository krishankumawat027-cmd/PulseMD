const mongoose = require('mongoose');

const emergencyRequestSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    patientName: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['ambulance', 'emergency_contact', 'nearest_hospital', 'quick_alert', 'emergency_help', 'one_button'],
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'HANDLED', 'CLOSED', 'CANCELLED', 'initiated', 'completed', 'cancelled'],
      default: 'ACTIVE',
      index: true
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    emergencyContactName: {
      type: String,
      trim: true,
      default: ''
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
      default: ''
    },
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      mapsUrl: { type: String, trim: true, default: '' }
    },
    selectedActions: {
      type: [String],
      default: []
    },
    actionLogs: {
      type: [
        {
          action: { type: String, trim: true, default: '' },
          status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
          message: { type: String, trim: true, default: '' },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    handledAt: {
      type: Date,
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    },
    triggeredAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmergencyRequest', emergencyRequestSchema);
