const express = require('express');
const multer = require('multer');
const { auth, requireRole } = require('../middleware/auth');
const {
  listFamilyMembers,
  createFamilyMember,
  getFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  uploadMemberReport,
  listMemberReports,
  listMemberPrescriptions,
  seedFamilyMembers
} = require('../controllers/familyController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/|application\/pdf$)/.test(file.mimetype)
      || /\.(jpg|jpeg|png|webp|gif|pdf)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Upload images or PDF reports only.'), ok);
  }
});

router.use(auth, requireRole('patient'));

router.get('/', listFamilyMembers);
router.post('/', createFamilyMember);
router.post('/seed', seedFamilyMembers);
router.get('/:id', getFamilyMember);
router.put('/:id', updateFamilyMember);
router.delete('/:id', deleteFamilyMember);
router.post('/:id/reports', upload.single('file'), uploadMemberReport);
router.get('/:id/reports', listMemberReports);
router.get('/:id/prescriptions', listMemberPrescriptions);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File is too large. Maximum size is 10MB.' });
  }
  if (error) return res.status(400).json({ message: error.message || 'Upload failed.' });
  return next();
});

module.exports = router;
