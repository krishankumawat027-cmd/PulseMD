const express = require('express');
const multer = require('multer');
const Message = require('../models/Message');
const ConsultationChat = require('../models/ConsultationChat');
const MedicalUpload = require('../models/MedicalUpload');
const PatientIntakeRequest = require('../models/PatientIntakeRequest');
const { auth, requireRole } = require('../middleware/auth');
const { getCloudinaryConfig, uploadBufferToCloudinary, uploadToCloudinary } = require('../services/cloudinaryService');
const { saveBufferToLocalUpload } = require('../utils/localUploadStorage');
const {
  findConsultationChat,
  ensureConsultationChat,
  createChatSystemMessage,
  emitChatStatus
} = require('../utils/consultationChat');
const { createPatientNotification } = require('../utils/patientNotifications');
const { createDoctorNotification } = require('../utils/doctorNotifications');

const router = express.Router();
const preInfoStore = new Map();
const MEDIA_UPLOAD_LIMIT = 25 * 1024 * 1024;
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'video/webm'];
    if (allowed.includes(file.mimetype) || /\.(webm|wav|mp3|m4a|ogg)$/i.test(file.originalname || '')) {
      return cb(null, true);
    }
    return cb(new Error('Unsupported audio format. Please record again in the browser.'));
  }
});
const FILE_RULES = {
  image: {
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
    maxBytes: 5 * 1024 * 1024
  },
  pdf: {
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    maxBytes: 10 * 1024 * 1024
  },
  video: {
    extensions: ['mp4', 'webm', 'mov'],
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxBytes: MEDIA_UPLOAD_LIMIT
  },
  audio: {
    extensions: ['webm', 'wav', 'mp3', 'm4a', 'ogg'],
    mimeTypes: ['audio/webm', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'],
    maxBytes: 10 * 1024 * 1024
  },
  file: {
    extensions: ['doc', 'docx', 'txt', 'rtf'],
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
      'text/rtf'
    ],
    maxBytes: 10 * 1024 * 1024
  }
};
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_UPLOAD_LIMIT },
  fileFilter: (req, file, cb) => {
    const messageType = getMessageType(file.originalname, file.mimetype);
    if (!messageType) {
      return cb(new Error('Unsupported file type. Upload images, PDFs, documents, audio, mp4, webm, or mov files.'));
    }
    const rule = FILE_RULES[messageType];
    if (file.size && file.size > rule.maxBytes) {
      return cb(new Error(`${messageType.toUpperCase()} file is too large.`));
    }
    return cb(null, true);
  }
});

function getFileExtension(fileName = '') {
  return String(fileName).split('.').pop().toLowerCase();
}

function getMessageType(fileName = '', mimeType = '') {
  const extension = getFileExtension(fileName);
  const mimeMatch = Object.entries(FILE_RULES).find(([, rule]) => rule.mimeTypes.includes(mimeType));
  if (mimeMatch) return mimeMatch[0];
  return Object.entries(FILE_RULES).find(([, rule]) => (
    rule.extensions.includes(extension) || rule.mimeTypes.includes(mimeType)
  ))?.[0] || '';
}

function estimateDataUrlBytes(fileData = '') {
  const value = String(fileData || '');
  if (!value.startsWith('data:')) return 0;
  const base64 = value.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

function validateAttachment({ fileName = '', mimeType = '', fileSize = 0, fileData = '' }) {
  const messageType = getMessageType(fileName, mimeType);
  if (!messageType) {
    return { valid: false, message: 'Unsupported file type. Upload images, PDFs, documents, mp4, webm, or mov files.' };
  }

  const rule = FILE_RULES[messageType];
  const effectiveSize = Math.max(Number(fileSize) || 0, estimateDataUrlBytes(fileData));
  if (effectiveSize > rule.maxBytes) {
    const limit = messageType === 'image' ? '5MB' : '10MB';
    return { valid: false, message: `${messageType.toUpperCase()} files must be ${limit} or smaller.` };
  }

  if (!String(fileData).startsWith('data:') && !/^https?:\/\//i.test(String(fileData))) {
    return { valid: false, message: 'fileData must be a base64 data URL or a remote URL.' };
  }

  return { valid: true, messageType, fileSize: effectiveSize };
}

function validateUploadedFile(file = {}) {
  const messageType = getMessageType(file.originalname, file.mimetype);
  if (!messageType) {
    return { valid: false, message: 'Unsupported file type. Upload images, PDFs, documents, audio, mp4, webm, or mov files.' };
  }

  const rule = FILE_RULES[messageType];
  if ((file.size || 0) > rule.maxBytes) {
    const limit = messageType === 'image' ? '5MB' : messageType === 'video' ? '25MB' : '10MB';
    return { valid: false, message: `${messageType.toUpperCase()} files must be ${limit} or smaller.` };
  }

  return { valid: true, messageType };
}

function isCloudinaryConfigured() {
  const config = getCloudinaryConfig();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

async function resolveRequestAiSummary(requestId, fallback = '') {
  const fallbackSummary = String(fallback || '').trim();
  if (!requestId) return fallbackSummary;

  try {
    const request = await PatientIntakeRequest.findById(requestId).select('aiSummary doctorId patientId status');
    console.info('Chat AI summary request lookup:', {
      requestId: requestId?.toString?.() || String(requestId),
      found: Boolean(request),
      doctorId: request?.doctorId?.toString?.() || '',
      patientId: request?.patientId?.toString?.() || '',
      status: request?.status || '',
      hasAiSummary: Boolean(request?.aiSummary || fallbackSummary)
    });
    return String(request?.aiSummary || fallbackSummary).trim();
  } catch (error) {
    console.warn('Chat AI summary lookup failed:', {
      requestId: requestId?.toString?.() || String(requestId),
      message: error.message
    });
    return fallbackSummary;
  }
}

async function assertChatCanReceiveMessage({ roomId, senderId, receiverId }) {
  const chat = await ConsultationChat.findOne({
    roomId,
    $or: [
      { patientId: senderId, doctorId: receiverId },
      { doctorId: senderId, patientId: receiverId }
    ]
  }).sort({ updatedAt: -1 });

  return chat?.status === 'closed'
    ? { ok: false, message: 'This consultation chat is closed.' }
    : { ok: true, chat };
}

async function notifyChatMessage(req, { receiverId, roomId, appointmentId, fileName = '', isAudio = false }) {
  if (req.user.role === 'doctor') {
    await createPatientNotification(req.app, {
      patientId: receiverId,
      type: 'doctor_sent_message',
      title: isAudio ? 'New voice message from doctor' : 'New attachment from doctor',
      message: isAudio
        ? `${req.user.name || 'Your doctor'} sent a voice message.`
        : `${req.user.name || 'Your doctor'} shared ${fileName}.`,
      relatedChatId: roomId,
      relatedAppointmentId: appointmentId || null
    });
  } else if (req.user.role === 'patient') {
    await createDoctorNotification(req.app, {
      doctorId: receiverId,
      patientId: req.user._id,
      patientName: req.user.name,
      type: 'patient_sent_message',
      title: isAudio ? 'New patient voice message' : 'New patient attachment',
      message: isAudio
        ? `${req.user.name || 'A patient'} sent a voice message.`
        : `${req.user.name || 'A patient'} shared ${fileName}.`,
      relatedChatId: roomId,
      relatedAppointmentId: appointmentId || null
    });
  }
}

function formatPreInfo(info = {}) {
  return [
    'PulseMD - Virtual Clinic AI pre-consultation summary:',
    `Name: ${info.name || '-'}`,
    `Age: ${info.age || '-'}`,
    `Weight: ${info.weight || '-'}`,
    `Gender: ${info.gender || '-'}`,
    `Symptoms: ${info.symptoms || '-'}`,
    `Duration: ${info.duration || '-'}`,
    `Severity: ${info.severity || '-'}`
  ].join('\n');
}

router.post('/pre-info', auth, requireRole('patient'), async (req, res) => {
  try {
    const { doctorId, appointmentId, preInfo = {} } = req.body;

    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor is required before connecting chat.' });
    }

    const cleanedInfo = {
      name: String(preInfo.name || '').trim(),
      age: String(preInfo.age || '').trim(),
      weight: String(preInfo.weight || '').trim(),
      gender: String(preInfo.gender || '').trim(),
      symptoms: String(preInfo.symptoms || '').trim(),
      duration: String(preInfo.duration || '').trim(),
      severity: String(preInfo.severity || '').trim(),
      currentMedicines: String(preInfo.currentMedicines || preInfo.medicines || '').trim()
    };

    if (!cleanedInfo.name || !cleanedInfo.age || !cleanedInfo.gender || !cleanedInfo.symptoms || !cleanedInfo.duration || !cleanedInfo.severity) {
      return res.status(400).json({ message: 'Please complete all AI assistant questions.' });
    }

    const roomId = String(doctorId);
    const storeKey = `${req.user._id}:${roomId}:${appointmentId || 'no-appointment'}`;
    const summaryText = formatPreInfo(cleanedInfo);
    preInfoStore.set(storeKey, {
      patientId: req.user._id.toString(),
      doctorId: roomId,
      appointmentId: appointmentId || null,
      preInfo: cleanedInfo,
      createdAt: new Date()
    });

    const existingSummary = await Message.findOne({
      roomId,
      appointmentId: appointmentId || null,
      sender: req.user._id,
      receiver: doctorId,
      text: summaryText
    });

    const message = existingSummary || await Message.create({
      roomId,
      chatRoomId: roomId,
      appointmentId: appointmentId || null,
      sender: req.user._id,
      receiver: doctorId,
      text: summaryText
    });

    const populated = await message.populate([
      { path: 'sender', select: 'name role' },
      { path: 'receiver', select: 'name role' }
    ]);

    res.status(existingSummary ? 200 : 201).json({
      message: 'Pre-consultation information saved.',
      preInfo: cleanedInfo,
      chatMessage: populated
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not save pre-consultation information.', error: error.message });
  }
});

router.post('/start', auth, async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId = null, requestId = null, familyMemberId = null, aiSummary = '' } = req.body;
    if (!patientId || !doctorId) {
      return res.status(400).json({ message: 'Patient and doctor are required.' });
    }

    const allowed = [patientId.toString(), doctorId.toString()].includes(req.user._id.toString());
    if (!allowed) return res.status(403).json({ message: 'You cannot start this chat.' });

    const roomId = doctorId.toString();
    const resolvedAiSummary = await resolveRequestAiSummary(requestId, aiSummary);
    const chat = await ensureConsultationChat({
      roomId,
      doctorId,
      patientId,
      appointmentId,
      requestId,
      familyMemberId,
      status: 'open',
      aiSummary: resolvedAiSummary
    });

    res.status(201).json({ message: 'Chat ready.', chat, roomId });
  } catch (error) {
    res.status(500).json({ message: 'Could not start chat.', error: error.message });
  }
});

router.get('/messages', auth, async (req, res) => {
  try {
    const roomId = String(req.query.roomId || '');
    if (!roomId) return res.status(400).json({ message: 'roomId is required.' });

    const messages = await Message.find({
      roomId,
      $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    })
      .populate('sender', 'name role')
      .populate('receiver', 'name role')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Could not load chat messages.', error: error.message });
  }
});

router.get('/list', auth, async (req, res) => {
  try {
    const query = req.user.role === 'doctor'
      ? { doctorId: req.user._id }
      : { patientId: req.user._id };

    const chats = await ConsultationChat.find(query)
      .populate('patientId', 'name email phone')
      .populate('doctorId', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .populate('requestId', 'aiSummary status patientId doctorId')
      .populate('prescriptionId')
      .sort({ updatedAt: -1 })
      .limit(50);

    const items = await Promise.all(chats.map(async (chat) => {
      const lastMessage = await Message.findOne({
        roomId: chat.roomId,
        $or: [{ sender: req.user._id }, { receiver: req.user._id }]
      })
        .populate('sender', 'name role')
        .sort({ createdAt: -1 })
        .select('text messageType fileName audioUrl fileUrl createdAt sender');

      return {
        _id: chat._id,
        roomId: chat.roomId,
        patientId: chat.patientId,
        doctorId: chat.doctorId,
        familyMemberId: chat.familyMemberId,
        appointmentId: chat.appointmentId,
        requestId: chat.requestId,
        aiSummary: chat.aiSummary || chat.requestId?.aiSummary || '',
        status: chat.status,
        prescriptionId: chat.prescriptionId,
        prescriptionSent: Boolean(chat.prescriptionSent || chat.prescriptionId || chat.status === 'prescription_sent'),
        closedAt: chat.closedAt,
        reopenedAt: chat.reopenedAt,
        updatedAt: chat.updatedAt,
        lastMessage
      };
    }));

    res.json({ chats: items });
  } catch (error) {
    res.status(500).json({ message: 'Could not load chat list.', error: error.message });
  }
});

router.post('/messages', auth, async (req, res) => {
  try {
    const roomId = String(req.body.roomId || '').trim();
    const receiverId = String(req.body.receiverId || '').trim();
    const text = String(req.body.text || req.body.message || '').trim();
    if (!roomId || !receiverId || !text) {
      return res.status(400).json({ message: 'roomId, receiverId, and message text are required.' });
    }

    const chat = await ConsultationChat.findOne({
      roomId,
      $or: [
        { patientId: req.user._id, doctorId: receiverId },
        { doctorId: req.user._id, patientId: receiverId }
      ]
    }).sort({ updatedAt: -1 });

    if (chat?.status === 'closed') {
      return res.status(403).json({ message: 'This consultation chat is closed.' });
    }

    const message = await Message.create({
      roomId,
      chatRoomId: roomId,
      appointmentId: req.body.appointmentId || null,
      familyMemberId: req.body.familyMemberId || chat?.familyMemberId || null,
      sender: req.user._id,
      receiver: receiverId,
      text
    });
    const populated = await message.populate([
      { path: 'sender', select: 'name role' },
      { path: 'receiver', select: 'name role' }
    ]);

    req.app.get('io')?.to(roomId).emit('receiveMessage', populated);

    if (req.user.role === 'doctor') {
      await createPatientNotification(req.app, {
        patientId: receiverId,
        type: 'doctor_sent_message',
        title: 'New message from doctor',
        message: `${req.user.name || 'Your doctor'} sent you a message.`,
        relatedChatId: roomId,
        relatedAppointmentId: req.body.appointmentId || null
      });
    } else if (req.user.role === 'patient') {
      await createDoctorNotification(req.app, {
        doctorId: receiverId,
        patientId: req.user._id,
        patientName: req.user.name,
        type: 'patient_sent_message',
        title: 'New patient message',
        message: `${req.user.name || 'A patient'} sent you a message.`,
        relatedChatId: roomId,
        relatedAppointmentId: req.body.appointmentId || null
      });
    }

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Could not send chat message.', error: error.message });
  }
});

router.post('/attachments', auth, async (req, res) => {
  try {
    const roomId = String(req.body.roomId || req.body.chatId || '').trim();
    const receiverId = String(req.body.receiverId || '').trim();
    const fileName = String(req.body.fileName || '').trim();
    const mimeType = String(req.body.mimeType || '').trim();
    const fileSize = Number(req.body.fileSize || 0);
    const fileData = String(req.body.fileData || '').trim();
    const existingFileUrl = String(req.body.fileUrl || req.body.url || '').trim();

    if (!roomId || !receiverId || !fileName || (!fileData && !existingFileUrl)) {
      return res.status(400).json({ message: 'roomId, receiverId, fileName, and a file upload URL are required.' });
    }

    const validation = validateAttachment({ fileName, mimeType, fileSize, fileData: fileData || existingFileUrl });
    if (!validation.valid) return res.status(400).json({ message: validation.message });

    const chat = await ConsultationChat.findOne({
      roomId,
      $or: [
        { patientId: req.user._id, doctorId: receiverId },
        { doctorId: req.user._id, patientId: receiverId }
      ]
    }).sort({ updatedAt: -1 });

    if (chat?.status === 'closed') {
      return res.status(403).json({ message: 'This consultation chat is closed.' });
    }

    const resourceType = validation.messageType === 'video' ? 'video' : validation.messageType === 'image' ? 'image' : 'raw';
    const uploaded = existingFileUrl
      ? {
        success: true,
        url: existingFileUrl,
        publicId: req.body.publicId || `chat-${Date.now()}`,
        resourceType,
        bytes: validation.fileSize || fileSize
      }
      : await uploadToCloudinary({
        fileData,
        folder: `caremitra/chat/${validation.messageType}s`,
        resourceType
      });

    if (!uploaded.success) {
      return res.status(502).json({ message: 'Cloud upload failed.', error: uploaded.message });
    }

    if (!existingFileUrl) {
      await MedicalUpload.create({
        owner: req.user._id,
        ownerRole: req.user.role,
        category: 'report',
        fileName,
        mimeType,
        publicId: uploaded.publicId,
        url: uploaded.url,
        resourceType: uploaded.resourceType || resourceType,
        bytes: uploaded.bytes || validation.fileSize || fileSize,
        relatedPatientId: req.user.role === 'patient' ? req.user._id : receiverId,
        familyMemberId: req.body.familyMemberId || chat?.familyMemberId || null,
        relatedDoctorId: req.user.role === 'doctor' ? req.user._id : receiverId,
        relatedAppointmentId: req.body.appointmentId || null
      });
    }

    const message = await Message.create({
      roomId,
      chatRoomId: roomId,
      appointmentId: req.body.appointmentId || null,
      familyMemberId: req.body.familyMemberId || chat?.familyMemberId || null,
      sender: req.user._id,
      receiver: receiverId,
      text: req.body.caption ? String(req.body.caption).trim() : '',
      messageType: validation.messageType,
      fileUrl: uploaded.url,
      fileName,
      fileMimeType: mimeType,
      fileSize: validation.fileSize || fileSize
    });

    const populated = await message.populate([
      { path: 'sender', select: 'name role' },
      { path: 'receiver', select: 'name role' }
    ]);

    req.app.get('io')?.to(roomId).emit('receiveMessage', populated);

    if (req.user.role === 'doctor') {
      await createPatientNotification(req.app, {
        patientId: receiverId,
        type: 'doctor_sent_message',
        title: 'New attachment from doctor',
        message: `${req.user.name || 'Your doctor'} shared ${fileName}.`,
        relatedChatId: roomId,
        relatedAppointmentId: req.body.appointmentId || null
      });
    } else if (req.user.role === 'patient') {
      await createDoctorNotification(req.app, {
        doctorId: receiverId,
        patientId: req.user._id,
        patientName: req.user.name,
        type: 'patient_sent_message',
        title: 'New patient attachment',
        message: `${req.user.name || 'A patient'} shared ${fileName}.`,
        relatedChatId: roomId,
        relatedAppointmentId: req.body.appointmentId || null
      });
    }

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Could not send attachment.', error: error.message });
  }
});

router.post('/upload-media', auth, mediaUpload.single('file'), async (req, res) => {
  try {
    const roomId = String(req.body.roomId || req.body.chatId || '').trim();
    const receiverId = String(req.body.receiverId || '').trim();

    if (!roomId || !receiverId) {
      return res.status(400).json({ message: 'roomId and receiverId are required.' });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ message: 'Please choose a file to upload.' });
    }

    const validation = validateUploadedFile(req.file);
    if (!validation.valid) return res.status(400).json({ message: validation.message });

    const chatState = await assertChatCanReceiveMessage({
      roomId,
      senderId: req.user._id,
      receiverId
    });
    if (!chatState.ok) return res.status(403).json({ message: chatState.message });

    const uploaded = await saveBufferToLocalUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      req,
      resourceType: validation.messageType === 'video' ? 'video' : validation.messageType === 'image' ? 'image' : 'raw'
    });

    if (!uploaded.success) {
      return res.status(502).json({ message: 'Upload failed. Please try again.', error: uploaded.message });
    }

    await MedicalUpload.create({
      owner: req.user._id,
      ownerRole: req.user.role,
      category: 'report',
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      publicId: uploaded.publicId,
      url: uploaded.secureUrl || uploaded.url,
      resourceType: uploaded.resourceType || validation.messageType,
      bytes: uploaded.bytes || req.file.size || 0,
      relatedPatientId: req.user.role === 'patient' ? req.user._id : receiverId,
      familyMemberId: req.body.familyMemberId || chatState.chat?.familyMemberId || null,
      relatedDoctorId: req.user.role === 'doctor' ? req.user._id : receiverId,
      relatedAppointmentId: req.body.appointmentId || null
    });

    const fileUrl = uploaded.secureUrl || uploaded.url;
    const message = await Message.create({
      roomId,
      chatRoomId: roomId,
      appointmentId: req.body.appointmentId || null,
      familyMemberId: req.body.familyMemberId || chatState.chat?.familyMemberId || null,
      sender: req.user._id,
      senderRole: req.user.role,
      receiver: receiverId,
      text: req.body.caption ? String(req.body.caption).trim() : '',
      messageType: validation.messageType,
      fileUrl,
      audioUrl: validation.messageType === 'audio' ? fileUrl : '',
      fileName: req.file.originalname,
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size || uploaded.bytes || 0,
      duration: Math.max(0, Math.round(Number(req.body.duration || 0)))
    });

    const populated = await message.populate([
      { path: 'sender', select: 'name role' },
      { path: 'receiver', select: 'name role' }
    ]);

    req.app.get('io')?.to(roomId).emit('receiveMessage', populated);
    await notifyChatMessage(req, {
      receiverId,
      roomId,
      appointmentId: req.body.appointmentId || null,
      fileName: req.file.originalname,
      isAudio: validation.messageType === 'audio'
    });

    res.status(201).json({
      message: 'File sent successfully.',
      fileUrl,
      chatMessage: populated
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not send attachment.', error: error.message });
  }
});

router.post('/upload-audio', auth, audioUpload.single('audio'), async (req, res) => {
  try {
    const roomId = String(req.body.roomId || req.body.chatId || '').trim();
    const receiverId = String(req.body.receiverId || '').trim();
    const duration = Math.max(0, Math.round(Number(req.body.duration || 0)));

    if (!roomId || !receiverId) {
      return res.status(400).json({ message: 'roomId and receiverId are required.' });
    }
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ message: 'No voice recording was received.' });
    }
    if (duration <= 0) {
      return res.status(400).json({ message: 'Recording is too short. Please record again.' });
    }

    const chatState = await assertChatCanReceiveMessage({
      roomId,
      senderId: req.user._id,
      receiverId
    });
    if (!chatState.ok) return res.status(403).json({ message: chatState.message });

    const uploaded = await saveBufferToLocalUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname || 'voice-message.webm',
      req,
      resourceType: 'video'
    });

    if (!uploaded.success) {
      return res.status(502).json({ message: 'Voice upload failed. Please try again.', error: uploaded.message });
    }

    const audioUrl = uploaded.secureUrl || uploaded.url;
    const message = await Message.create({
      roomId,
      chatRoomId: roomId,
      appointmentId: req.body.appointmentId || null,
      familyMemberId: req.body.familyMemberId || chatState.chat?.familyMemberId || null,
      sender: req.user._id,
      senderRole: req.user.role,
      receiver: receiverId,
      text: '',
      messageType: 'audio',
      audioUrl,
      fileUrl: audioUrl,
      fileName: req.file.originalname || 'voice-message.webm',
      fileMimeType: req.file.mimetype || 'audio/webm',
      fileSize: req.file.size || uploaded.bytes || 0,
      duration
    });

    const populated = await message.populate([
      { path: 'sender', select: 'name role' },
      { path: 'receiver', select: 'name role' }
    ]);

    req.app.get('io')?.to(roomId).emit('receiveMessage', populated);
    await notifyChatMessage(req, {
      receiverId,
      roomId,
      appointmentId: req.body.appointmentId || null,
      isAudio: true
    });

    res.status(201).json({
      message: 'Voice message sent.',
      audioUrl,
      duration,
      chatMessage: populated
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not send voice message.', error: error.message });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File is too large. Images can be 5MB, audio/documents 10MB, and videos 25MB.' });
  }
  if (error) {
    return res.status(400).json({ message: error.message || 'Voice upload failed.' });
  }
  return next();
});

router.get('/:id/status', auth, async (req, res) => {
  try {
    const chat = await findConsultationChat({
      roomId: req.params.id,
      userId: req.user._id,
      role: req.user.role,
      patientId: req.query.patientId || null
    });

    if (!chat) {
      return res.json({
        exists: false,
        roomId: req.params.id,
        status: 'open',
        aiSummary: '',
        prescriptionId: null
      });
    }

    res.json({ exists: true, chat });
  } catch (error) {
    res.status(500).json({ message: 'Could not load chat status.', error: error.message });
  }
});

router.post('/:id/send-prescription', auth, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId = null, requestId = null, prescriptionId = null } = req.body;
    if (!patientId) return res.status(400).json({ message: 'Patient is required.' });

    const chat = await ensureConsultationChat({
      roomId: req.params.id,
      doctorId: req.user._id,
      patientId,
      appointmentId,
      requestId,
      status: 'prescription_sent'
    });
    chat.status = 'prescription_sent';
    chat.prescriptionId = prescriptionId || chat.prescriptionId || null;
    chat.prescriptionSent = true;
    await chat.save();

    const message = await createChatSystemMessage({
      roomId: chat.roomId,
      senderId: req.user._id,
      receiverId: patientId,
      appointmentId: chat.appointmentId,
      text: 'Prescription has been shared by doctor.'
    });
    await emitChatStatus(req.app, chat, message);

    await createPatientNotification(req.app, {
      patientId,
      type: 'prescription_uploaded',
      title: 'Prescription shared',
      message: 'Prescription has been shared by your doctor.',
      relatedChatId: chat.roomId,
      relatedAppointmentId: chat.appointmentId,
      relatedPrescriptionId: chat.prescriptionId
    });

    res.json({ message: 'Prescription status shared.', chat, systemMessage: message });
  } catch (error) {
    res.status(500).json({ message: 'Could not update prescription chat status.', error: error.message });
  }
});

router.post('/:id/close', auth, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId = null, requestId = null } = req.body;
    if (!patientId) return res.status(400).json({ message: 'Patient is required.' });

    const chat = await ensureConsultationChat({
      roomId: req.params.id,
      doctorId: req.user._id,
      patientId,
      appointmentId,
      requestId
    });
    chat.status = 'closed';
    chat.closedBy = req.user._id;
    chat.closedAt = new Date();
    await chat.save();

    const message = await createChatSystemMessage({
      roomId: chat.roomId,
      senderId: req.user._id,
      receiverId: patientId,
      appointmentId: chat.appointmentId,
      text: 'Doctor closed this consultation chat.'
    });
    await emitChatStatus(req.app, chat, message);

    await createPatientNotification(req.app, {
      patientId,
      type: 'consultation_closed',
      title: 'Consultation chat closed',
      message: 'This consultation chat has been closed by the doctor.',
      relatedChatId: chat.roomId,
      relatedAppointmentId: chat.appointmentId
    });

    res.json({ message: 'Chat closed.', chat, systemMessage: message });
  } catch (error) {
    res.status(500).json({ message: 'Could not close chat.', error: error.message });
  }
});

router.post('/:id/reopen', auth, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId = null, requestId = null } = req.body;
    if (!patientId) return res.status(400).json({ message: 'Patient is required.' });

    const chat = await ensureConsultationChat({
      roomId: req.params.id,
      doctorId: req.user._id,
      patientId,
      appointmentId,
      requestId
    });
    chat.status = 'reopened';
    chat.reopenedAt = new Date();
    await chat.save();

    const message = await createChatSystemMessage({
      roomId: chat.roomId,
      senderId: req.user._id,
      receiverId: patientId,
      appointmentId: chat.appointmentId,
      text: 'Doctor reopened this consultation chat.'
    });
    await emitChatStatus(req.app, chat, message);

    await createPatientNotification(req.app, {
      patientId,
      type: 'consultation_reopened',
      title: 'Consultation reopened',
      message: 'Doctor reopened the chat for follow-up.',
      relatedChatId: chat.roomId,
      relatedAppointmentId: chat.appointmentId
    });

    res.json({ message: 'Chat reopened.', chat, systemMessage: message });
  } catch (error) {
    res.status(500).json({ message: 'Could not reopen chat.', error: error.message });
  }
});

module.exports = router;
