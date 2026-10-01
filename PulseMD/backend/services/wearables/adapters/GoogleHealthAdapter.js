const BaseWearableAdapter = require('./BaseWearableAdapter');

class GoogleHealthAdapter extends BaseWearableAdapter {
  constructor(provider = 'fitbit') {
    super(provider);
  }

  async connect(options = {}) {
    return super.connect({
      ...options,
      sourceDevice: options.sourceDevice || (this.provider === 'fitbit' ? 'Google Health / Fitbit' : 'Android Health Connect')
    });
  }

  async syncData({ payload } = {}) {
    // Fitbit should flow through the Google Health API architecture where available.
    // Android devices should use Health Connect as the primary aggregation layer.
    return Array.isArray(payload?.records) ? payload.records : this.mockRecords();
  }
}

module.exports = GoogleHealthAdapter;
