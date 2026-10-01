const express = require('express');
const { authMiddleware, allowRoles } = require('../middleware/auth');
const { upload, fileType } = require('../middleware/upload');
const { Report } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const query = req.user.role === 'patient' ? { patient: req.user._id } : req.user.role === 'doctor' ? { doctor: req.user._id } : {};
    res.json(await Report.find(query).populate('patient doctor', 'name email').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/', allowRoles('patient'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Report file is required.' });
    const report = await Report.create({
      patient: req.user._id,
      doctor: req.body.doctor || null,
      appointment: req.body.appointment || null,
      title: req.body.title || req.file.originalname,
      notes: req.body.notes,
      type: fileType(req.file.mimetype),
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    res.status(201).json(report);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
