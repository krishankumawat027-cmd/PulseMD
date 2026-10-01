const express = require('express');
const LocationLog = require('../models/LocationLog');
const { auth } = require('../middleware/auth');
const { normalizeCoordinates } = require('../services/locationService');

const router = express.Router();

router.use(auth);

router.post('/save', async (req, res) => {
  try {
    const { error, location: normalized } = normalizeCoordinates(req.body);
    if (error) return res.status(400).json({ message: error });

    const location = await LocationLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      accuracy: normalized.accuracy,
      source: req.body.source || 'manual',
      relatedEmergencyId: req.body.relatedEmergencyId || null
    });

    res.status(201).json({ message: 'Location saved.', location, mapsUrl: normalized.mapsUrl });
  } catch (error) {
    res.status(500).json({ message: 'Could not save location.', error: error.message });
  }
});

module.exports = router;
