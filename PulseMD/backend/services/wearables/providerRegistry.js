const AppleHealthAdapter = require('./adapters/AppleHealthAdapter');
const GoogleHealthAdapter = require('./adapters/GoogleHealthAdapter');
const SamsungHealthAdapter = require('./adapters/SamsungHealthAdapter');
const GarminAdapter = require('./adapters/GarminAdapter');
const WithingsAdapter = require('./adapters/WithingsAdapter');

const PROVIDER_ALIASES = {
  apple: 'apple_health',
  apple_health: 'apple_health',
  applewatch: 'apple_health',
  apple_watch: 'apple_health',
  healthkit: 'apple_health',
  fitbit: 'fitbit',
  google_health: 'fitbit',
  samsung: 'samsung_health',
  samsung_health: 'samsung_health',
  health_connect: 'samsung_health',
  garmin: 'garmin',
  withings: 'withings'
};

function normalizeProvider(provider = '') {
  const key = String(provider || '').toLowerCase().replace(/[\s-]+/g, '_');
  return PROVIDER_ALIASES[key] || '';
}

function getAdapter(provider) {
  const normalized = normalizeProvider(provider);
  const adapters = {
    apple_health: () => new AppleHealthAdapter(),
    fitbit: () => new GoogleHealthAdapter('fitbit'),
    samsung_health: () => new SamsungHealthAdapter(),
    garmin: () => new GarminAdapter(),
    withings: () => new WithingsAdapter()
  };

  if (!adapters[normalized]) {
    const error = new Error('Unsupported wearable provider.');
    error.statusCode = 400;
    throw error;
  }

  return adapters[normalized]();
}

module.exports = {
  normalizeProvider,
  getAdapter
};
