const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    roomId: {
      type: String,
      required: true,
      index: true
    },
    callType: {
      type: String,
      enum: ['audio', 'video'],
      default: 'video'
    },
    status: {
      type: String,
      enum: ['ringing', 'connected', 'ended', 'missed'],
      default: 'ringing',
      index: true
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    connectedAt: {
      type: Date,
      default: null
    },
    endedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('VideoCall', videoCallSchema);
