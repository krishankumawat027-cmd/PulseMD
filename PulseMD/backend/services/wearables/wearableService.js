const crypto = require('crypto');
const { WearableConnection } = require('../../models/WearableConnection');
const { WearableMetric } = require('../../models/WearableMetric');
const WearableSyncAudit = require('../../models/WearableSyncAudit');
const { getAdapter, normalizeProvider } = require('./providerRegistry');

const SUPPORTED_METRICS = [
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

const DEFAULT_PERMISSIONS = [
  'steps',
  'heart_rate',
  'resting_heart_rate',
  'sleep',
  'calories',
  'oxygen_saturation',
  'blood_pressure',
  'workouts'
];

function metricRange(metricType) {
  return {
    steps: [0, 150000],
    heart_rate: [25, 240],
    resting_heart_rate: [25, 160],
    sleep_duration: [0, 1440],
    calories_burned: [0, 20000],
    oxygen_saturation: [50, 100]
  }[metricType];
}

function normalizeMetricType(type = '') {
  const normalized = String(type || '').toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    heartrate: 'heart_rate',
    restingheartrate: 'resting_heart_rate',
    sleep: 'sleep_duration',
    sleep_stages: 'sleep_stage',
    calories: 'calories_burned',
    spo2: 'oxygen_saturation',
    oxygen: 'oxygen_saturation',
    bp: 'blood_pressure',
    exercise: 'workout',
    workout_session: 'workout'
  };
  return aliases[normalized] || normalized;
}

function normalizeUnit(metricType, unit = '') {
  const raw = String(unit || '').toLowerCase();
  const defaults = {
    steps: 'count',
    heart_rate: 'bpm',
    resting_heart_rate: 'bpm',
    sleep_duration: 'minutes',
    sleep_stage: 'stage',
    calories_burned: 'kcal',
    oxygen_saturation: 'percent',
    blood_pressure: 'mmHg',
    workout: 'session'
  };
  if (['beats/min', 'beats per minute'].includes(raw)) return 'bpm';
  if (['calorie', 'calories', 'cal'].includes(raw)) return 'kcal';
  if (['%', 'percentage'].includes(raw)) return 'percent';
  if (['min', 'mins', 'minute'].includes(raw)) return 'minutes';
  return raw || defaults[metricType] || 'value';
}

function normalizeValue(metricType, value, unit) {
  if (value === null || value === undefined || value === '') return null;

  if (metricType === 'blood_pressure') {
    const systolic = Number(value.systolic ?? value.sys);
    const diastolic = Number(value.diastolic ?? value.dia);
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
    return { systolic, diastolic };
  }

  if (metricType === 'workout') {
    return typeof value === 'object' ? value : { name: String(value) };
  }

  if (metricType === 'sleep_stage') {
    return typeof value === 'object' ? value : String(value);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (metricType === 'sleep_duration' && ['hour', 'hours', 'hr', 'hrs'].includes(String(unit || '').toLowerCase())) {
    return Math.round(number * 60);
  }
  return number;
}

function parseRecordedAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return null;
  const earliest = new Date('2000-01-01T00:00:00.000Z');
  const latest = new Date(Date.now() + 10 * 60 * 1000);
  if (date < earliest || date > latest) return null;
  return date;
}

function recordNeedsReview(metricType, value) {
  if (metricType === 'blood_pressure') {
    return value.systolic < 60 || value.systolic > 250 || value.diastolic < 30 || value.diastolic > 160;
  }
  const range = metricRange(metricType);
  if (!range || typeof value !== 'number') return false;
  return value < range[0] || value > range[1];
}

function makeSourceRecordId(record) {
  if (record.sourceRecordId) return record.sourceRecordId;
  return crypto
    .createHash('sha1')
    .update([
      record.provider,
      record.metricType,
      record.recordedAt?.toISOString?.() || record.recordedAt,
      record.sourceDevice,
      JSON.stringify(record.metricValue)
    ].join('|'))
    .digest('hex');
}

function validateAndNormalizeRecord(record, provider, userId) {
  const metricType = normalizeMetricType(record.metricType);
  if (!SUPPORTED_METRICS.includes(metricType)) return { rejected: true, reason: 'unsupported_metric' };

  const unit = normalizeUnit(metricType, record.unit);
  const metricValue = normalizeValue(metricType, record.metricValue, record.unit);
  if (metricValue === null) return { rejected: true, reason: 'empty_or_invalid_value' };

  const recordedAt = parseRecordedAt(record.recordedAt);
  if (!recordedAt) return { rejected: true, reason: 'invalid_timestamp' };

  const normalized = {
    userId,
    provider,
    metricType,
    metricValue,
    unit,
    recordedAt,
    originalTimezone: record.originalTimezone || 'UTC',
    sourceDevice: record.sourceDevice || provider,
    syncStatus: 'CONNECTED',
    verificationFlag: record.verificationFlag || 'AGGREGATED_PLATFORM',
    qualityFlags: [],
    rawPayload: record.rawPayload || record
  };

  normalized.sourceRecordId = makeSourceRecordId({ ...record, ...normalized });

  if (recordNeedsReview(metricType, metricValue)) {
    normalized.needsReview = true;
    normalized.qualityFlags.push('OUT_OF_RANGE');
  }

  return { rejected: false, record: normalized };
}

async function createAudit(userId, provider, syncStatus, details = {}) {
  return WearableSyncAudit.create({
    userId,
    provider,
    syncStatus,
    startedAt: new Date(),
    ...details
  });
}

async function updateAudit(audit, updates = {}) {
  if (!audit) return null;
  Object.assign(audit, updates, { finishedAt: new Date() });
  return audit.save();
}

async function connectWearable(userId, providerParam, options = {}) {
  const provider = normalizeProvider(providerParam);
  const adapter = getAdapter(provider);
  if (!options.consentAccepted) {
    const error = new Error('Privacy consent is required before connecting a wearable.');
    error.statusCode = 400;
    throw error;
  }

  const connectionInfo = await adapter.connect({
    permissions: options.permissions?.length ? options.permissions : DEFAULT_PERMISSIONS,
    sourceDevice: options.sourceDevice,
    tokenPayload: options.tokenPayload || {}
  });

  const connection = await WearableConnection.findOneAndUpdate(
    { userId, provider },
    {
      $set: {
        provider,
        syncStatus: 'CONNECTED',
        permissions: connectionInfo.permissions,
        consentAccepted: true,
        consentAcceptedAt: new Date(),
        sourceDevice: connectionInfo.sourceDevice,
        tokenMeta: connectionInfo.tokenMeta,
        errorMessage: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await createAudit(userId, provider, 'CONNECTED', { message: 'Wearable connected.' });
  return connection;
}

async function disconnectWearable(userId, providerParam) {
  const provider = normalizeProvider(providerParam);
  const adapter = getAdapter(provider);
  await adapter.disconnect();
  const connection = await WearableConnection.findOneAndUpdate(
    { userId, provider },
    {
      $set: {
        syncStatus: 'DISCONNECTED',
        tokenMeta: { accessToken: '', refreshToken: '', expiresAt: null, scope: [] },
        errorMessage: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await createAudit(userId, provider, 'DISCONNECTED', { message: 'Wearable disconnected.' });
  return connection;
}

async function syncWearable(userId, providerParam, payload = {}) {
  const provider = normalizeProvider(providerParam);
  const adapter = getAdapter(provider);
  const audit = await createAudit(userId, provider, 'SYNCING');

  const connection = await WearableConnection.findOne({ userId, provider });
  if (!connection || !connection.consentAccepted || connection.syncStatus === 'DISCONNECTED') {
    const error = new Error('Connect this wearable and accept privacy consent before syncing.');
    error.statusCode = 400;
    await updateAudit(audit, { syncStatus: 'ERROR', message: error.message });
    throw error;
  }
  if (connection.syncStatus === 'TOKEN_EXPIRED') {
    const error = new Error('Wearable token expired. Please reconnect this provider.');
    error.statusCode = 401;
    error.code = 'TOKEN_EXPIRED';
    await updateAudit(audit, { syncStatus: 'TOKEN_EXPIRED', message: error.message });
    throw error;
  }
  connection.syncStatus = 'SYNCING';
  connection.errorMessage = '';
  await connection.save();

  try {
    const rawRecords = await adapter.syncData({ connection, payload });
    const normalizedRecords = adapter.normalizeData(rawRecords);
    const rejected = [];
    let saved = 0;

    for (const item of normalizedRecords) {
      const result = validateAndNormalizeRecord(item, provider, userId);
      if (result.rejected) {
        rejected.push({ reason: result.reason, item });
        continue;
      }

      const existing = await WearableMetric.findOne({
        userId,
        provider,
        metricType: result.record.metricType,
        sourceRecordId: result.record.sourceRecordId
      }).select('recordedAt');
      if (existing && existing.recordedAt > result.record.recordedAt) continue;

      await WearableMetric.findOneAndUpdate(
        {
          userId,
          provider,
          metricType: result.record.metricType,
          sourceRecordId: result.record.sourceRecordId
        },
        { $set: result.record },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved += 1;
    }

    connection.syncStatus = 'CONNECTED';
    connection.lastSyncedAt = new Date();
    await connection.save();
    await updateAudit(audit, {
      syncStatus: 'CONNECTED',
      recordsReceived: rawRecords.length,
      recordsSaved: saved,
      recordsRejected: rejected.length,
      details: { rejected: rejected.slice(0, 10) },
      message: 'Wearable sync completed.'
    });

    return { connection, recordsReceived: rawRecords.length, recordsSaved: saved, recordsRejected: rejected.length };
  } catch (error) {
    connection.syncStatus = error.code === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'ERROR';
    connection.errorMessage = error.message;
    await connection.save();
    await updateAudit(audit, {
      syncStatus: connection.syncStatus,
      message: error.message
    });
    throw error;
  }
}

async function getStatus(userId) {
  const connections = await WearableConnection.find({ userId }).sort({ provider: 1 });
  return connections;
}

async function getMetrics(userId, query = {}) {
  const filter = { userId };
  if (query.provider) filter.provider = normalizeProvider(query.provider);
  if (query.metricType) filter.metricType = normalizeMetricType(query.metricType);
  if (query.from || query.to) {
    filter.recordedAt = {};
    if (query.from) filter.recordedAt.$gte = parseRecordedAt(query.from) || new Date(query.from);
    if (query.to) filter.recordedAt.$lte = parseRecordedAt(query.to) || new Date(query.to);
  }
  return WearableMetric.find(filter).sort({ recordedAt: -1 }).limit(Math.min(Number(query.limit) || 200, 500));
}

async function getSummary(userId) {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleBefore = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const [connections, todaySteps, latestHeartRate, lastSleep, weeklyMetrics] = await Promise.all([
    WearableConnection.find({ userId }).sort({ provider: 1 }),
    WearableMetric.find({ userId, metricType: 'steps', recordedAt: { $gte: startOfToday } }).sort({ recordedAt: -1 }),
    WearableMetric.findOne({ userId, metricType: { $in: ['heart_rate', 'resting_heart_rate'] } }).sort({ recordedAt: -1 }),
    WearableMetric.findOne({ userId, metricType: 'sleep_duration' }).sort({ recordedAt: -1 }),
    WearableMetric.find({ userId, recordedAt: { $gte: sevenDaysAgo } }).sort({ recordedAt: 1 }).limit(1000)
  ]);

  const stepsTotal = todaySteps.reduce((sum, item) => sum + Number(item.metricValue || 0), 0);
  const newestSync = connections
    .map((item) => item.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const connectedProviders = connections.filter((item) => item.syncStatus === 'CONNECTED' || item.syncStatus === 'SYNCING');
  const dailySteps = new Map();
  weeklyMetrics
    .filter((item) => item.metricType === 'steps')
    .forEach((item) => {
      const dateKey = item.recordedAt.toISOString().slice(0, 10);
      dailySteps.set(dateKey, (dailySteps.get(dateKey) || 0) + Number(item.metricValue || 0));
    });
  const weeklyTrends = [...dailySteps.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({
      date,
      label: new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-IN', { weekday: 'short' }),
      value,
      unit: 'steps'
    }));
  const sleepMinutes = Number(lastSleep?.metricValue || 0);

  return {
    connections,
    connectedProviders: connectedProviders.map((item) => item.provider),
    cards: {
      todaySteps: {
        value: stepsTotal,
        unit: 'steps',
        sourceDevice: todaySteps[0]?.sourceDevice || connections[0]?.sourceDevice || '',
        recordedAt: todaySteps[0]?.recordedAt || null
      },
      latestHeartRate: latestHeartRate ? {
        value: Number(latestHeartRate.metricValue || 0),
        unit: latestHeartRate.unit || 'bpm',
        sourceDevice: latestHeartRate.sourceDevice || '',
        recordedAt: latestHeartRate.recordedAt || null
      } : null,
      lastNightSleep: lastSleep ? {
        value: Number((sleepMinutes / 60).toFixed(1)),
        rawMinutes: sleepMinutes,
        unit: 'h',
        sourceDevice: lastSleep.sourceDevice || '',
        recordedAt: lastSleep.recordedAt || null
      } : null,
      weeklyTrends
    },
    lastSyncedAt: newestSync,
    dataNotUpdated: !newestSync || new Date(newestSync) < staleBefore,
    disclaimer: 'Wearable readings are supportive health information and not a final medical diagnosis.'
  };
}

module.exports = {
  DEFAULT_PERMISSIONS,
  connectWearable,
  disconnectWearable,
  syncWearable,
  getStatus,
  getMetrics,
  getSummary,
  validateAndNormalizeRecord
};
