const express = require('express');
const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const SymptomHistory = require('../models/SymptomHistory');
const FamilyMember = require('../models/FamilyMember');
const { auth, requireRole } = require('../middleware/auth');
const { isWithinSchedule, getAvailabilityState } = require('../utils/availability');
const { createDoctorNotification } = require('../utils/doctorNotifications');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const query = req.user.role === 'doctor'
      ? { doctor: req.user._id }
      : { patient: req.user._id };

    if (req.user.role === 'admin') {
      delete query.patient;
      delete query.doctor;
    }

    const appointments = await Appointment.find(query)
      .populate('doctor', 'name email phone')
      .populate('patient', 'name email phone')
      .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
      .sort({ scheduledAt: -1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Could not load appointments.', error: error.message });
  }
});

router.post('/', requireRole('patient'), async (req, res) => {
  try {
    const { doctorId, scheduledAt, reason, symptomHistoryId = '', familyMemberId = '' } = req.body;

    if (!doctorId || !scheduledAt) {
      return res.status(400).json({ message: 'Doctor and appointment time are required.' });
    }

    const doctorProfile = await DoctorProfile.findOne({ user: doctorId });
    if (!doctorProfile || (!doctorProfile.isVerified && !['verified', 'Verified'].includes(doctorProfile.verificationStatus))) {
      return res.status(403).json({ message: 'Only verified doctors can accept appointment bookings.' });
    }
    if (doctorProfile.availabilityStatus === 'offline') {
      return res.status(403).json({ message: 'Doctor is currently offline. Please choose another slot.' });
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: 'Invalid appointment date/time.' });
    }

    if (!isWithinSchedule(scheduledDate, doctorProfile.availabilitySchedule)) {
      const availability = getAvailabilityState(doctorProfile);
      return res.status(400).json({
        message: `Please select a slot during doctor active time. ${availability.label}`,
        availability
      });
    }

    const consultationFee = doctorProfile?.fee || 0;
    let familyMember = null;
    if (familyMemberId) {
      familyMember = await FamilyMember.findOne({ _id: familyMemberId, userId: req.user._id });
      if (!familyMember) return res.status(404).json({ message: 'Family member not found for this account.' });
    }

    let symptomHistory = null;
    if (symptomHistoryId) {
      const symptomQuery = { _id: symptomHistoryId, patient: req.user._id };
      if (familyMember) symptomQuery.familyMemberId = familyMember._id;
      symptomHistory = await SymptomHistory.findOne(symptomQuery);
      if (!symptomHistory) return res.status(404).json({ message: 'Symptom history not found.' });
    }

    const appointment = await Appointment.create({
      patient: req.user._id,
      familyMemberId: familyMember?._id || null,
      doctor: doctorId,
      scheduledAt,
      reason,
      symptomSummary: symptomHistory ? symptomHistory.symptomText || symptomHistory.symptoms.join(', ') : '',
      symptomHistory: symptomHistory?._id || null,
      suggestedSpecialty: symptomHistory?.suggestedSpecialty || '',
      urgencyLevel: symptomHistory?.urgencyLevel || '',
      consultationFee,
      paymentStatus: consultationFee > 0 ? 'pending' : 'not_required',
      status: consultationFee > 0 ? 'payment_pending' : 'pending'
    });

    const populated = await appointment.populate([
      { path: 'doctor', select: 'name email phone' },
      { path: 'patient', select: 'name email phone' },
      { path: 'familyMemberId', select: 'fullName relation age gender bloodGroup quickHealthStatus' }
    ]);

    const memberLine = familyMember ? ` for ${familyMember.fullName} (${familyMember.relation})` : '';

    await createDoctorNotification(req.app, {
      doctorId,
      patientId: req.user._id,
      patientName: populated.patient?.name || req.user.name || 'Patient',
      type: 'appointment_booked',
      title: 'New appointment booked',
      message: `${populated.patient?.name || 'A patient'} booked an appointment${memberLine} for ${new Date(populated.scheduledAt).toLocaleString('en-IN')}.${symptomHistory ? ` Symptoms: ${symptomHistory.symptomText || symptomHistory.symptoms.join(', ')}` : ''}`,
      relatedAppointmentId: populated._id
    });

    req.app.get('io')?.to(`doctor-notify:${doctorId}`).emit('appointmentNotification', {
      appointment: populated,
      patientName: populated.patient.name,
      createdAt: new Date()
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Could not book appointment.', error: error.message });
  }
});

router.delete('/:id', requireRole('doctor'), async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndDelete({
      _id: req.params.id,
      doctor: req.user._id
    });

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    res.json({ ok: true, message: 'Appointment deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete appointment.', error: error.message });
  }
});

module.exports = router;
