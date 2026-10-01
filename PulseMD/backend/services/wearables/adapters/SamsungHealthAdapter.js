const BaseWearableAdapter = require('./BaseWearableAdapter');

class SamsungHealthAdapter extends BaseWearableAdapter {
  constructor() {
    super('samsung_health');
  }

  async connect(options = {}) {
    return super.connect({
      ...options,
      sourceDevice: options.sourceDevice || 'Samsung Health via Health Connect'
    });
  }
}

module.exports = SamsungHealthAdapter;
