const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const wearableController = require('../controllers/wearableController');

const router = express.Router();

router.use(auth, requireRole('patient'));

router.post('/connect/:provider', wearableController.connect);
router.post('/disconnect/:provider', wearableController.disconnect);
router.post('/sync/:provider', wearableController.sync);
router.get('/status', wearableController.status);
router.get('/metrics', wearableController.metrics);
router.get('/summary', wearableController.summary);

module.exports = router;
