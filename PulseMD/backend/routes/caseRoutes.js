const express = require('express');
const PatientCase = require('../models/PatientCase');
const PatientIntakeRequest = require('../models/PatientIntakeRequest');
const { auth } = require('../middleware/auth');

const router = express.Router();

async function canDoctorAccessCase(userId, patientCase) {
  if (!patientCase || !userId) return false;
  return [
    patientCase.doctorAssigned?.toString(),
    ...(patientCase.notifiedDoctors || []).map((id) => id.toString())
  ].includes(userId.toString());
}

router.get('/:caseId', auth, async (req, res) => {
  try {
    const patientCase = await PatientCase.findById(req.params.caseId)
      .populate('patientId', 'name email phone')
      .populate('doctorAssigned', 'name email phone')
      .populate('notifiedDoctors', 'name email phone');

    if (!patientCase) return res.status(404).json({ message: 'Patient case not found.' });

    if (req.user.role === 'patient' && patientCase.patientId?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only view your own cases.' });
    }

    if (req.user.role === 'doctor' && !(await canDoctorAccessCase(req.user._id, patientCase))) {
      return res.status(403).json({ message: 'You can only view cases assigned or notified to you.' });
    }

    res.json(patientCase);
  } catch (error) {
    res.status(500).json({ message: 'Could not load patient case.', error: error.message });
  }
});

router.patch('/:caseId/assign', auth, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') return res.status(403).json({ message: 'Doctor access only.' });

    const patientCase = await PatientCase.findById(req.params.caseId);
    if (!patientCase) return res.status(404).json({ message: 'Patient case not found.' });
    if (!(await canDoctorAccessCase(req.user._id, patientCase)) && patientCase.doctorAssigned) {
      return res.status(403).json({ message: 'This case is assigned to another doctor.' });
    }

    patientCase.doctorAssigned = req.user._id;
    patientCase.status = 'in-progress';
    patientCase.startedAt = patientCase.startedAt || new Date();
    if (!patientCase.notifiedDoctors.some((id) => id.toString() === req.user._id.toString())) {
      patientCase.notifiedDoctors.push(req.user._id);
    }
    await patientCase.save();

    await PatientIntakeRequest.updateMany(
      { caseId: patientCase._id },
      { doctorId: req.user._id, status: 'joined', joinedAt: new Date() }
    );

    res.json(patientCase);
  } catch (error) {
    res.status(500).json({ message: 'Could not assign patient case.', error: error.message });
  }
});

router.patch('/:caseId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in-progress', 'closed', 'declined', 'later'].includes(status)) {
      return res.status(400).json({ message: 'Invalid case status.' });
    }

    const patientCase = await PatientCase.findById(req.params.caseId);
    if (!patientCase) return res.status(404).json({ message: 'Patient case not found.' });

    if (req.user.role === 'doctor' && !(await canDoctorAccessCase(req.user._id, patientCase))) {
      return res.status(403).json({ message: 'You can only update cases assigned or notified to you.' });
    }

    if (req.user.role === 'patient' && patientCase.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own cases.' });
    }

    patientCase.status = status;
    if (status === 'in-progress') patientCase.startedAt = patientCase.startedAt || new Date();
    if (status === 'closed') patientCase.closedAt = new Date();
    await patientCase.save();

    res.json(patientCase);
  } catch (error) {
    res.status(500).json({ message: 'Could not update patient case.', error: error.message });
  }
});

module.exports = router;
