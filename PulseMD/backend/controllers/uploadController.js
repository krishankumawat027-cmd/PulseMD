const MedicalUpload = require('../models/MedicalUpload');
const { getCloudinaryConfig, uploadBufferToCloudinary, uploadToCloudinary } = require('../services/cloudinaryService');
const { saveBufferToLocalUpload } = require('../utils/localUploadStorage');

const ALLOWED_CATEGORIES = ['report', 'prescription', 'profile', 'verification', 'other'];

function getMessageType(file = {}) {
  const mimeType = String(file.mimetype || file.mimeType || '').toLowerCase();
  const fileName = String(file.originalname || file.fileName || '').toLowerCase();

  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(fileName)) return 'image';
  if (mimeType === 'application/pdf' || /\.pdf$/.test(fileName)) return 'pdf';
  if (mimeType.startsWith('video/') || /\.(mp4|webm|mov)$/.test(fileName)) return 'video';
  if (mimeType.startsWith('audio/') || /\.(wav|mp3|m4a|ogg)$/.test(fileName)) return 'audio';
  return 'file';
}

function isCloudinaryConfigured() {
  const config = getCloudinaryConfig();
  return Boolean(config.cloudName && config.apiKey && config.apiSecret);
}

async function uploadIncomingBuffer(req, { folder, resourceType }) {
  if (isCloudinaryConfigured()) {
    const uploaded = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder,
      resourceType
    });
    if (uploaded.success) return uploaded;
  }

  return saveBufferToLocalUpload({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    req,
    resourceType
  });
}

async function uploadSingleFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a file to upload.' });
    }

    const category = ALLOWED_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
    const messageType = getMessageType(req.file);
    const uploaded = await uploadIncomingBuffer(req, {
      folder: `caremitra/${category}s`,
      resourceType: messageType === 'video' ? 'video' : messageType === 'image' ? 'image' : 'raw'
    });

    if (!uploaded.success) {
      return res.status(502).json({ message: 'Upload failed.', error: uploaded.message });
    }

    const record = await MedicalUpload.create({
      owner: req.user._id,
      ownerRole: req.user.role,
      category,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      publicId: uploaded.publicId,
      url: uploaded.secureUrl || uploaded.url,
      resourceType: uploaded.resourceType || messageType,
      bytes: uploaded.bytes || req.file.size || 0,
      relatedPatientId: req.body.relatedPatientId || (req.user.role === 'patient' ? req.user._id : null),
      familyMemberId: req.body.familyMemberId || null,
      relatedDoctorId: req.body.relatedDoctorId || (req.user.role === 'doctor' ? req.user._id : null),
      relatedAppointmentId: req.body.relatedAppointmentId || null
    });

    res.status(201).json({
      message: 'File uploaded successfully.',
      url: uploaded.secureUrl || uploaded.url,
      secure_url: uploaded.secureUrl || uploaded.url,
      fileUrl: uploaded.secureUrl || uploaded.url,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size || uploaded.bytes || 0,
      messageType,
      upload: record
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not upload file.', error: error.message });
  }
}

async function uploadMedicalFile(req, res) {
  try {
    const fileData = String(req.body.fileData || '').trim();
    const fileName = String(req.body.fileName || '').trim();
    const mimeType = String(req.body.mimeType || '').trim();
    const category = ALLOWED_CATEGORIES.includes(req.body.category) ? req.body.category : 'other';

    if (!fileData) {
      return res.status(400).json({ message: 'fileData is required as a base64 data URL or remote URL.' });
    }

    const folder = `caremitra/${category}s`;
    const uploaded = await uploadToCloudinary({
      fileData,
      folder,
      resourceType: req.body.resourceType || 'auto'
    });

    if (!uploaded.success) {
      return res.status(502).json({ message: 'Cloud upload failed.', error: uploaded.message });
    }

    const record = await MedicalUpload.create({
      owner: req.user._id,
      ownerRole: req.user.role,
      category,
      fileName,
      mimeType,
      publicId: uploaded.publicId,
      url: uploaded.url,
      resourceType: uploaded.resourceType,
      bytes: uploaded.bytes || 0,
      relatedPatientId: req.body.relatedPatientId || (req.user.role === 'patient' ? req.user._id : null),
      familyMemberId: req.body.familyMemberId || null,
      relatedDoctorId: req.body.relatedDoctorId || (req.user.role === 'doctor' ? req.user._id : null),
      relatedPrescriptionId: req.body.relatedPrescriptionId || null,
      relatedAppointmentId: req.body.relatedAppointmentId || null
    });

    res.status(201).json({
      message: 'File uploaded successfully.',
      upload: record
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not upload file.', error: error.message });
  }
}

async function listMyUploads(req, res) {
  try {
    const uploads = await MedicalUpload.find({
      $or: [
        { owner: req.user._id },
        { relatedPatientId: req.user._id },
        { relatedDoctorId: req.user._id }
      ]
    }).sort({ createdAt: -1 }).limit(80);

    res.json(uploads);
  } catch (error) {
    res.status(500).json({ message: 'Could not load uploads.', error: error.message });
  }
}

module.exports = { listMyUploads, uploadMedicalFile, uploadSingleFile };
