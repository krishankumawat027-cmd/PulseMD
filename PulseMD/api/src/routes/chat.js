const express = require('express');
const { authMiddleware, allowRoles } = require('../middleware/auth');
const { upload, fileType } = require('../middleware/upload');
const { ChatMessage, Notification } = require('../models');

const router = express.Router();
router.use(authMiddleware);

router.get('/:userId', async (req, res, next) => {
  try {
    const other = req.params.userId;
    const messages = await ChatMessage.find({
      $or: [
        { sender: req.user._id, receiver: other },
        { sender: other, receiver: req.user._id }
      ]
    }).populate('sender receiver', 'name role').sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post('/message', allowRoles('doctor', 'patient'), async (req, res, next) => {
  try {
    const { receiver, text, appointment } = req.body;
    if (!receiver || !text) return res.status(400).json({ message: 'Receiver and text are required.' });
    const message = await ChatMessage.create({ sender: req.user._id, receiver, senderRole: req.user.role, text, appointment, messageType: 'text' });
    await Notification.create({ user: receiver, role: req.user.role === 'doctor' ? 'patient' : 'doctor', type: 'chat', title: 'New message', message: `${req.user.name} sent a message.` });
    req.app.get('io')?.to(String(receiver)).emit('chat:message', message);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

router.post('/upload', allowRoles('doctor', 'patient'), upload.single('file'), async (req, res, next) => {
  try {
    const { receiver, text, appointment } = req.body;
    if (!receiver || !req.file) return res.status(400).json({ message: 'Receiver and file are required.' });
    const messageType = fileType(req.file.mimetype);
    const message = await ChatMessage.create({
      sender: req.user._id,
      receiver,
      senderRole: req.user.role,
      appointment: appointment || null,
      text,
      messageType,
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    req.app.get('io')?.to(String(receiver)).emit('chat:message', message);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
