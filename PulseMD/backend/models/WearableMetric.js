const mongoose = require('mongoose');

const METRIC_TYPES = [
  'steps',
  'heart_rate',
  'resting_heart_rate',
  'sleep_duration',
  'sleep_stage',
  'calories_burned',
  'oxygen_saturation',
  'blood_pressure',
  'workout'
];

const VERIFICATION_FLAGS = ['DIRECT_DEVICE', 'AGGREGATED_PLATFORM', 'MANUAL_ENTRY'];

const wearableMetricSchema = new mongoose.Schema(
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
    metricType: {
      type: String,
      enum: METRIC_TYPES,
      required: true,
      index: true
    },
    metricValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    unit: {
      type: String,
      trim: true,
      required: true
    },
    recordedAt: {
      type: Date,
      required: true,
      index: true
    },
    originalTimezone: {
      type: String,
      trim: true,
      default: 'UTC'
    },
    sourceDevice: {
      type: String,
      trim: true,
      required: true
    },
    syncStatus: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'TOKEN_EXPIRED', 'SYNCING', 'ERROR'],
      default: 'CONNECTED'
    },
    verificationFlag: {
      type: String,
      enum: VERIFICATION_FLAGS,
      default: 'AGGREGATED_PLATFORM',
      index: true
    },
    qualityFlags: {
      type: [String],
      default: []
    },
    needsReview: {
      type: Boolean,
      default: false,
      index: true
    },
    sourceRecordId: {
      type: String,
      trim: true,
      default: ''
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

wearableMetricSchema.index(
  { userId: 1, provider: 1, metricType: 1, sourceRecordId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceRecordId: { $type: 'string', $gt: '' } }
  }
);
wearableMetricSchema.index({ userId: 1, provider: 1, metricType: 1, recordedAt: 1, sourceDevice: 1 });

module.exports = {
  WearableMetric: mongoose.model('WearableMetric', wearableMetricSchema),
  METRIC_TYPES,
  VERIFICATION_FLAGS
};
