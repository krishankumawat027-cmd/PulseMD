const wearableService = require('../services/wearables/wearableService');
const { normalizeProvider } = require('../services/wearables/providerRegistry');

function sendError(res, error) {
  res.status(error.statusCode || 500).json({
    message: error.message || 'Wearable request failed.'
  });
}

async function connect(req, res) {
  try {
    const connection = await wearableService.connectWearable(req.user._id, req.params.provider, req.body);
    res.json({ message: 'Wearable connected.', connection });
  } catch (error) {
    sendError(res, error);
  }
}

async function disconnect(req, res) {
  try {
    const connection = await wearableService.disconnectWearable(req.user._id, req.params.provider);
    res.json({ message: 'Wearable disconnected.', connection });
  } catch (error) {
    sendError(res, error);
  }
}

async function sync(req, res) {
  try {
    const result = await wearableService.syncWearable(req.user._id, req.params.provider, req.body);
    res.json({ message: 'Wearable sync completed.', ...result });
  } catch (error) {
    sendError(res, error);
  }
}

async function status(req, res) {
  try {
    const connections = await wearableService.getStatus(req.user._id);
    res.json({
      providers: ['apple_health', 'fitbit', 'samsung_health', 'garmin', 'withings'],
      connections
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function metrics(req, res) {
  try {
    if (req.query.provider && !normalizeProvider(req.query.provider)) {
      return res.status(400).json({ message: 'Unsupported wearable provider.' });
    }
    const records = await wearableService.getMetrics(req.user._id, req.query);
    res.json({ records });
  } catch (error) {
    sendError(res, error);
  }
}

async function summary(req, res) {
  try {
    const data = await wearableService.getSummary(req.user._id);
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = {
  connect,
  disconnect,
  sync,
  status,
  metrics,
  summary
};
