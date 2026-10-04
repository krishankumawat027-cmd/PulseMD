const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
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
      enum: ['calling', 'ringing', 'accepted', 'declined', 'ended', 'missed'],
      default: 'ringing',
      index: true
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    startedAt: {
      type: Date,
      default: null
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    declinedAt: {
      type: Date,
      default: null
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

videoCallSchema.pre('validate', function assignCallId(next) {
  if (!this.callId) {
    this.callId = `call_${new Date().getTime()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  next();
});

module.exports = mongoose.model('VideoCall', videoCallSchema);
