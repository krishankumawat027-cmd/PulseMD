const mongoose = require('mongoose');

const wearableSyncAuditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    provider: {
      type: String,
      required: true,
      index: true
    },
    syncStatus: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'SYNCING', 'ERROR'],
      required: true,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    finishedAt: {
      type: Date,
      default: null
    },
    recordsReceived: {
      type: Number,
      default: 0
    },
    recordsSaved: {
      type: Number,
      default: 0
    },
    recordsRejected: {
      type: Number,
      default: 0
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('WearableSyncAudit', wearableSyncAuditSchema);
