const express = require('express');
const { authMiddleware, allowRoles } = require('../middleware/auth');
const { EmergencyAlert, PatientProfile, Notification, User } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', allowRoles('admin', 'doctor'), async (req, res, next) => {
  try {
    const query = req.user.role === 'doctor' ? { assignedDoctor: req.user._id } : {};
    res.json(await EmergencyAlert.find(query).populate('patient assignedDoctor', 'name email phone').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/alert', allowRoles('patient'), async (req, res, next) => {
  try {
    const profile = await PatientProfile.findOne({ user: req.user._id });
    const alert = await EmergencyAlert.create({
      patient: req.user._id,
      assignedDoctor: req.body.doctor || null,
      message: req.body.message || 'One-click emergency alert',
      location: req.body.location,
      contactPhone: req.body.contactPhone || profile?.emergencyContact?.phone
    });
    const admins = await User.find({ role: 'admin' });
    await Notification.insertMany(admins.map((admin) => ({ user: admin._id, role: 'admin', type: 'emergency', title: 'Emergency alert', message: `${req.user.name} triggered emergency help.` })));
    if (alert.assignedDoctor) await Notification.create({ user: alert.assignedDoctor, role: 'doctor', type: 'emergency', title: 'Emergency alert', message: `${req.user.name} needs urgent help.` });
    req.app.get('io')?.emit('emergency:alert', alert);
    res.status(201).json({ alert, ambulance: { number: '108', enabled: true } });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', allowRoles('admin', 'doctor'), async (req, res, next) => {
  try {
    const alert = await EmergencyAlert.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
