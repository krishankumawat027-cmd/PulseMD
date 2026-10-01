const FamilyMember = require('../models/FamilyMember');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const HealthRecord = require('../models/HealthRecord');
const MedicalUpload = require('../models/MedicalUpload');
const SymptomHistory = require('../models/SymptomHistory');
const { uploadBufferToCloudinary } = require('../services/cloudinaryService');
const { saveBufferToLocalUpload } = require('../utils/localUploadStorage');

const VALID_GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];
const VALID_RECORD_TYPES = ['report', 'lab_report', 'document', 'image', 'prescription', 'doctor_note'];

function cleanText(value) {
  return String(value || '').trim();
}

function memberPayload(body = {}) {
  const fullName = cleanText(body.fullName);
  const relation = cleanText(body.relation);
  const age = Number(body.age);

  if (!fullName) return { error: 'Full name is required.' };
  if (!Number.isFinite(age) || age < 0 || age > 130) return { error: 'Enter a valid age.' };
  if (!relation) return { error: 'Relation is required.' };

  return {
    data: {
      fullName,
      age,
      gender: VALID_GENDERS.includes(body.gender) ? body.gender : 'prefer_not_to_say',
      relation,
      bloodGroup: cleanText(body.bloodGroup),
      allergies: cleanText(body.allergies),
      chronicDiseases: cleanText(body.chronicDiseases),
      currentMedicines: cleanText(body.currentMedicines),
      pastMedicalHistory: cleanText(body.pastMedicalHistory),
      emergencyContact: cleanText(body.emergencyContact),
      address: cleanText(body.address),
      profilePhotoUrl: cleanText(body.profilePhotoUrl),
      quickHealthStatus: cleanText(body.quickHealthStatus) || 'Stable',
      isSelf: Boolean(body.isSelf)
    }
  };
}

async function findOwnedMember(userId, memberId) {
  return FamilyMember.findOne({ _id: memberId, userId });
}

async function uploadFamilyFile(req) {
  if (!req.file) return null;
  const resourceType = req.file.mimetype?.startsWith('image/') ? 'image' : 'raw';
  const cloud = await uploadBufferToCloudinary({
    buffer: req.file.buffer,
    folder: 'pulsemd/family-records',
    resourceType
  }).catch((error) => ({ success: false, message: error.message }));

  if (cloud?.success) return cloud;
  return saveBufferToLocalUpload({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    req,
    resourceType
  });
}

async function listFamilyMembers(req, res) {
  try {
    const search = cleanText(req.query.search).toLowerCase();
    const relation = cleanText(req.query.relation).toLowerCase();
    const query = { userId: req.user._id };

    const members = await FamilyMember.find(query).sort({ isSelf: -1, updatedAt: -1 });
    const filtered = members.filter((member) => {
      const relationMatch = !relation || member.relation.toLowerCase() === relation;
      const searchMatch = !search || [
        member.fullName,
        member.relation,
        member.bloodGroup,
        member.quickHealthStatus
      ].join(' ').toLowerCase().includes(search);
      return relationMatch && searchMatch;
    });

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: 'Could not load family members.', error: error.message });
  }
}

async function createFamilyMember(req, res) {
  try {
    const payload = memberPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const member = await FamilyMember.create({
      userId: req.user._id,
      ...payload.data
    });

    res.status(201).json({ message: 'Family member added.', member });
  } catch (error) {
    res.status(500).json({ message: 'Could not add family member.', error: error.message });
  }
}

async function getFamilyMember(req, res) {
  try {
    const member = await findOwnedMember(req.user._id, req.params.id);
    if (!member) return res.status(404).json({ message: 'Family member not found.' });

    const [appointments, prescriptions, reports, symptomHistory] = await Promise.all([
      Appointment.find({ patient: req.user._id, familyMemberId: member._id }).populate('doctor', 'name email phone').sort({ scheduledAt: -1 }),
      Prescription.find({ patient: req.user._id, familyMemberId: member._id }).populate('doctor', 'name email phone').populate('appointment').sort({ prescriptionDate: -1 }),
      HealthRecord.find({ userId: req.user._id, familyMemberId: member._id }).sort({ createdAt: -1 }),
      SymptomHistory.find({ patient: req.user._id, familyMemberId: member._id }).sort({ createdAt: -1 }).limit(20)
    ]);

    res.json({ member, appointments, prescriptions, reports, symptomHistory });
  } catch (error) {
    res.status(500).json({ message: 'Could not load family member profile.', error: error.message });
  }
}

async function updateFamilyMember(req, res) {
  try {
    const payload = memberPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const member = await FamilyMember.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      payload.data,
      { new: true }
    );
    if (!member) return res.status(404).json({ message: 'Family member not found.' });

    res.json({ message: 'Family member updated.', member });
  } catch (error) {
    res.status(500).json({ message: 'Could not update family member.', error: error.message });
  }
}

async function deleteFamilyMember(req, res) {
  try {
    const member = await findOwnedMember(req.user._id, req.params.id);
    if (!member) return res.status(404).json({ message: 'Family member not found.' });

    const linkedCounts = await Promise.all([
      Appointment.countDocuments({ patient: req.user._id, familyMemberId: member._id }),
      Prescription.countDocuments({ patient: req.user._id, familyMemberId: member._id }),
      HealthRecord.countDocuments({ userId: req.user._id, familyMemberId: member._id })
    ]);

    if (linkedCounts.some(Boolean)) {
      member.quickHealthStatus = 'Archived profile';
      await member.save();
      return res.json({ message: 'Profile has medical history, so it was archived instead of removed.', member });
    }

    await member.deleteOne();
    res.json({ message: 'Family member deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete family member.', error: error.message });
  }
}

async function uploadMemberReport(req, res) {
  try {
    const member = await findOwnedMember(req.user._id, req.params.id);
    if (!member) return res.status(404).json({ message: 'Family member not found.' });
    if (!req.file) return res.status(400).json({ message: 'Please choose a report file.' });

    const uploaded = await uploadFamilyFile(req);
    if (!uploaded?.success) return res.status(502).json({ message: 'Report upload failed.', error: uploaded?.message });

    const recordType = VALID_RECORD_TYPES.includes(req.body.type) ? req.body.type : 'report';
    const report = await HealthRecord.create({
      userId: req.user._id,
      familyMemberId: member._id,
      type: recordType,
      title: cleanText(req.body.title) || req.file.originalname,
      notes: cleanText(req.body.notes),
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileUrl: uploaded.secureUrl || uploaded.url,
      uploadedBy: req.user._id
    });

    await MedicalUpload.create({
      owner: req.user._id,
      ownerRole: req.user.role,
      category: recordType === 'prescription' ? 'prescription' : 'report',
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      publicId: uploaded.publicId,
      url: uploaded.secureUrl || uploaded.url,
      resourceType: uploaded.resourceType || 'raw',
      bytes: uploaded.bytes || req.file.size || 0,
      relatedPatientId: req.user._id,
      familyMemberId: member._id
    });

    res.status(201).json({ message: 'Report uploaded.', report });
  } catch (error) {
    res.status(500).json({ message: 'Could not upload report.', error: error.message });
  }
}

async function listMemberReports(req, res) {
  try {
    const member = await findOwnedMember(req.user._id, req.params.id);
    if (!member) return res.status(404).json({ message: 'Family member not found.' });

    const reports = await HealthRecord.find({ userId: req.user._id, familyMemberId: member._id }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Could not load reports.', error: error.message });
  }
}

async function listMemberPrescriptions(req, res) {
  try {
    const member = await findOwnedMember(req.user._id, req.params.id);
    if (!member) return res.status(404).json({ message: 'Family member not found.' });

    const prescriptions = await Prescription.find({ patient: req.user._id, familyMemberId: member._id })
      .populate('doctor', 'name email phone')
      .populate('appointment')
      .sort({ prescriptionDate: -1 });
    res.json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: 'Could not load prescriptions.', error: error.message });
  }
}

async function seedFamilyMembers(req, res) {
  try {
    const existing = await FamilyMember.countDocuments({ userId: req.user._id });
    if (existing) return res.json({ message: 'Family profiles already exist.' });

    const samples = await FamilyMember.insertMany([
      {
        userId: req.user._id,
        fullName: req.user.name || 'Self',
        age: 30,
        gender: 'prefer_not_to_say',
        relation: 'Self',
        bloodGroup: 'O+',
        quickHealthStatus: 'Stable',
        emergencyContact: req.user.phone || '',
        isSelf: true
      },
      {
        userId: req.user._id,
        fullName: 'Ramesh Sharma',
        age: 62,
        gender: 'male',
        relation: 'Father',
        bloodGroup: 'B+',
        chronicDiseases: 'Diabetes',
        currentMedicines: 'Metformin',
        quickHealthStatus: 'Needs sugar monitoring'
      },
      {
        userId: req.user._id,
        fullName: 'Sita Sharma',
        age: 58,
        gender: 'female',
        relation: 'Mother',
        bloodGroup: 'A+',
        allergies: 'Dust allergy',
        quickHealthStatus: 'Stable'
      }
    ]);

    res.status(201).json({ message: 'Sample family profiles added.', members: samples });
  } catch (error) {
    res.status(500).json({ message: 'Could not seed family members.', error: error.message });
  }
}

module.exports = {
  listFamilyMembers,
  createFamilyMember,
  getFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  uploadMemberReport,
  listMemberReports,
  listMemberPrescriptions,
  seedFamilyMembers
};
