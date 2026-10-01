const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { listMyUploads, uploadMedicalFile, uploadSingleFile } = require('../controllers/uploadController');

const router = express.Router();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/webm',
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/ogg'
    ];
    const allowedName = /\.(jpg|jpeg|png|webp|gif|heic|heif|pdf|txt|doc|docx|mp4|webm|mov|wav|mp3|m4a|ogg)$/i.test(file.originalname || '');
    if (allowedMimeTypes.includes(file.mimetype) || allowedName) return cb(null, true);
    return cb(new Error('Unsupported file type. Upload images, documents, videos, or browser voice recordings.'));
  }
});

router.use(auth);

router.get('/', listMyUploads);
router.post('/', upload.single('file'), uploadSingleFile);
router.post('/cloudinary', uploadMedicalFile);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File is too large. Maximum size is 10MB.' });
  }
  if (error) {
    return res.status(400).json({ message: error.message || 'Upload failed.' });
  }
  return next();
});

module.exports = router;
