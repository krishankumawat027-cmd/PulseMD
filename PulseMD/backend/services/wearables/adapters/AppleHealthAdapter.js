const BaseWearableAdapter = require('./BaseWearableAdapter');

class AppleHealthAdapter extends BaseWearableAdapter {
  constructor() {
    super('apple_health');
  }

  async connect(options = {}) {
    return super.connect({
      ...options,
      sourceDevice: options.sourceDevice || 'Apple Health / Apple Watch'
    });
  }

  async syncData({ payload } = {}) {
    // Apple HealthKit data must arrive from a native iOS layer or companion app.
    return Array.isArray(payload?.records) ? payload.records : this.mockRecords();
  }
}

module.exports = AppleHealthAdapter;
