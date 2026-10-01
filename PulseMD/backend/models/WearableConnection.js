const mongoose = require('mongoose');

const SYNC_STATUSES = ['CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'SYNCING', 'ERROR'];
const PROVIDERS = ['apple_health', 'fitbit', 'samsung_health', 'garmin', 'withings'];

const wearableConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    provider: {
      type: String,
      enum: PROVIDERS,
      required: true,
      index: true
    },
    syncStatus: {
      type: String,
      enum: SYNC_STATUSES,
      default: 'DISCONNECTED',
      index: true
    },
    permissions: {
      type: [String],
      default: []
    },
    consentAccepted: {
      type: Boolean,
      default: false
    },
    consentAcceptedAt: {
      type: Date,
      default: null
    },
    lastSyncedAt: {
      type: Date,
      default: null
    },
    sourceDevice: {
      type: String,
      trim: true,
      default: ''
    },
    tokenMeta: {
      accessToken: { type: String, default: '' },
      refreshToken: { type: String, default: '' },
      expiresAt: { type: Date, default: null },
      scope: { type: [String], default: [] }
    },
    errorMessage: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

wearableConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = {
  WearableConnection: mongoose.model('WearableConnection', wearableConnectionSchema),
  SYNC_STATUSES,
  PROVIDERS
};
