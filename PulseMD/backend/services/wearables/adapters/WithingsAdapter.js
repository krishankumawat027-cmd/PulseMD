const BaseWearableAdapter = require('./BaseWearableAdapter');

class WithingsAdapter extends BaseWearableAdapter {
  constructor() {
    super('withings');
  }

  async connect(options = {}) {
    return super.connect({
      ...options,
      sourceDevice: options.sourceDevice || 'Withings'
    });
  }
}

module.exports = WithingsAdapter;
