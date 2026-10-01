const express = require('express');
const Message = require('../models/Message');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/conversation/:roomId', async (req, res) => {
  try {
    const messages = await Message.find({
      roomId: req.params.roomId,
      $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    })
      .populate('sender', 'name role')
      .populate('receiver', 'name role')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Could not load conversation.', error: error.message });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    }).select('fileUrl fileName messageType');

    if (!message || !message.fileUrl) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }

    res.redirect(message.fileUrl);
  } catch (error) {
    res.status(500).json({ message: 'Could not open attachment.', error: error.message });
  }
});

router.get('/:id/attachment-url', async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.id,
      $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    }).select('fileUrl fileName messageType fileMimeType');

    if (!message || !message.fileUrl) {
      return res.status(404).json({ message: 'Attachment not found.' });
    }

    res.json({
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      messageType: message.messageType,
      mimeType: message.fileMimeType
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not open attachment.', error: error.message });
  }
});

router.patch('/conversation/:roomId/read', async (req, res) => {
  try {
    await Message.updateMany(
      { roomId: req.params.roomId, receiver: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Could not mark messages read.', error: error.message });
  }
});

module.exports = router;
