class BaseWearableAdapter {
  constructor(provider) {
    this.provider = provider;
  }

  async connect({ permissions = [], sourceDevice = '', tokenPayload = {} } = {}) {
    return {
      provider: this.provider,
      permissions,
      sourceDevice,
      tokenMeta: {
        accessToken: tokenPayload.accessToken || '',
        refreshToken: tokenPayload.refreshToken || '',
        expiresAt: tokenPayload.expiresAt || null,
        scope: permissions
      }
    };
  }

  async refreshToken(connection) {
    return connection?.tokenMeta || {};
  }

  async syncData({ payload } = {}) {
    return Array.isArray(payload?.records) ? payload.records : this.mockRecords();
  }

  normalizeData(records = []) {
    return records.map((record) => ({
      provider: this.provider,
      metricType: record.metricType,
      metricValue: record.metricValue,
      unit: record.unit,
      recordedAt: record.recordedAt,
      originalTimezone: record.originalTimezone || record.timezone || 'UTC',
      sourceDevice: record.sourceDevice || this.provider,
      sourceRecordId: record.sourceRecordId || record.id || '',
      verificationFlag: record.verificationFlag || 'AGGREGATED_PLATFORM',
      rawPayload: record.rawPayload || record
    }));
  }

  async disconnect() {
    return { provider: this.provider, disconnected: true };
  }

  mockRecords() {
    const now = new Date();
    const lastNight = new Date(now.getTime() - 9 * 60 * 60 * 1000);
    return [
      {
        sourceRecordId: `${this.provider}-steps-${now.toISOString().slice(0, 10)}`,
        metricType: 'steps',
        metricValue: 8420,
        unit: 'count',
        recordedAt: now,
        sourceDevice: this.provider,
        verificationFlag: 'AGGREGATED_PLATFORM'
      },
      {
        sourceRecordId: `${this.provider}-hr-${now.getTime()}`,
        metricType: 'heart_rate',
        metricValue: 78,
        unit: 'bpm',
        recordedAt: now,
        sourceDevice: this.provider,
        verificationFlag: 'DIRECT_DEVICE'
      },
      {
        sourceRecordId: `${this.provider}-rhr-${now.toISOString().slice(0, 10)}`,
        metricType: 'resting_heart_rate',
        metricValue: 64,
        unit: 'bpm',
        recordedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        sourceDevice: this.provider,
        verificationFlag: 'AGGREGATED_PLATFORM'
      },
      {
        sourceRecordId: `${this.provider}-sleep-${lastNight.toISOString().slice(0, 10)}`,
        metricType: 'sleep_duration',
        metricValue: 425,
        unit: 'minutes',
        recordedAt: lastNight,
        sourceDevice: this.provider,
        verificationFlag: 'AGGREGATED_PLATFORM'
      },
      {
        sourceRecordId: `${this.provider}-sleep-deep-${lastNight.toISOString().slice(0, 10)}`,
        metricType: 'sleep_stage',
        metricValue: { stage: 'deep', durationMinutes: 92 },
        unit: 'stage',
        recordedAt: lastNight,
        sourceDevice: this.provider,
        verificationFlag: 'AGGREGATED_PLATFORM'
      },
      {
        sourceRecordId: `${this.provider}-calories-${now.toISOString().slice(0, 10)}`,
        metricType: 'calories_burned',
        metricValue: 540,
        unit: 'kcal',
        recordedAt: now,
        sourceDevice: this.provider,
        verificationFlag: 'AGGREGATED_PLATFORM'
      },
      {
        sourceRecordId: `${this.provider}-spo2-${now.toISOString().slice(0, 10)}`,
        metricType: 'oxygen_saturation',
        metricValue: 97,
        unit: 'percent',
        recordedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        sourceDevice: this.provider,
        verificationFlag: 'DIRECT_DEVICE'
      },
      {
        sourceRecordId: `${this.provider}-bp-${now.toISOString().slice(0, 10)}`,
        metricType: 'blood_pressure',
        metricValue: { systolic: 118, diastolic: 76 },
        unit: 'mmHg',
        recordedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        sourceDevice: this.provider,
        verificationFlag: 'DIRECT_DEVICE'
      },
      {
        sourceRecordId: `${this.provider}-workout-${now.toISOString().slice(0, 10)}`,
        metricType: 'workout',
        metricValue: { name: 'Walk', durationMinutes: 32, calories: 145 },
        unit: 'session',
        recordedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        sourceDevice: this.provider,
        verificationFlag: 'DIRECT_DEVICE'
      }
    ];
  }
}

module.exports = BaseWearableAdapter;
