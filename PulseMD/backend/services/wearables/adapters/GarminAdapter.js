const BaseWearableAdapter = require('./BaseWearableAdapter');

class GarminAdapter extends BaseWearableAdapter {
  constructor() {
    super('garmin');
  }

  async connect(options = {}) {
    return super.connect({
      ...options,
      sourceDevice: options.sourceDevice || 'Garmin Connect'
    });
  }
}

module.exports = GarminAdapter;
