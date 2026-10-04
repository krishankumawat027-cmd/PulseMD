const express = require('express');
const VideoCall = require('../models/VideoCall');
const Appointment = require('../models/Appointment');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

async function findCallByReference(reference) {
  if (!reference) return null;
  const normalized = String(reference).trim();
  if (!normalized) return null;
  return VideoCall.findOne({
    $or: [
      { _id: normalized },
      { callId: normalized }
    ]
  }).lean();
}

function emitCallEvent(io, call, event, extra = {}) {
  if (!io || !call) return;
  const payload = { call, status: call.status, event, ...extra };
  io.to(`patient_${call.patientId}`).emit('videoCallStatus', payload);
  io.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', payload);
  if (call.roomId) io.to(call.roomId).emit(event, payload);
}

router.post('/start', async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId = null, callType = 'video' } = req.body;
    if (!patientId || !doctorId) {
      return res.status(400).json({ message: 'Patient and doctor are required.' });
    }

    const patientObjectId = String(patientId);
    const doctorObjectId = String(doctorId);
    const actorId = String(req.user._id);
    const isAuthorized = [patientObjectId, doctorObjectId].includes(actorId);
    if (!isAuthorized) return res.status(403).json({ message: 'You cannot start this call.' });

    if (req.user.role === 'patient' && actorId !== patientObjectId) {
      return res.status(403).json({ message: 'Patients can only initiate calls for themselves.' });
    }

    if (req.user.role === 'doctor' && actorId !== doctorObjectId) {
      return res.status(403).json({ message: 'Doctors can only start calls for their own consultations.' });
    }

    if (appointmentId) {
      const appointment = await Appointment.findOne({
        _id: appointmentId,
        patient: patientObjectId,
        doctor: doctorObjectId,
        status: { $in: ['confirmed', 'payment_pending', 'pending'] }
      }).lean();
      if (!appointment) {
        return res.status(403).json({ message: 'This appointment is not valid for a call.' });
      }
    }

    const existingOpenCall = await VideoCall.findOne({
      patientId: patientObjectId,
      doctorId: doctorObjectId,
      status: { $in: ['calling', 'ringing', 'accepted'] }
    }).sort({ createdAt: -1 });
    if (existingOpenCall && existingOpenCall.status !== 'ended' && existingOpenCall.status !== 'declined' && existingOpenCall.status !== 'missed') {
      return res.status(409).json({ message: 'A call is already active for this patient and doctor.', call: existingOpenCall });
    }

    const roomId = `call:${doctorObjectId}:${patientObjectId}:${Date.now()}`;
    const call = await VideoCall.create({
      callId: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      patientId: patientObjectId,
      doctorId: doctorObjectId,
      appointmentId: appointmentId || null,
      roomId,
      callType: callType === 'audio' ? 'audio' : 'video',
      status: 'ringing',
      startedBy: req.user._id,
      startedAt: new Date()
    });

    const doctor = await require('../models/User').findById(doctorObjectId).select('name photo').lean();
    const io = req.app.get('io');
    const payload = {
      call: {
        ...call.toObject(),
        doctorName: doctor?.name || 'Doctor',
        patientName: req.user?.name || 'Patient'
      },
      doctorName: doctor?.name || 'Doctor',
      status: 'ringing',
      event: 'CALL_RINGING'
    };
    io?.to(`patient_${patientObjectId}`).emit('videoCallStatus', payload);
    io?.to(`doctor-notify:${doctorObjectId}`).emit('videoCallStatus', payload);
    if (call.roomId) io?.to(call.roomId).emit('CALL_RINGING', payload);
    console.info('CALL_CREATED', { callId: call.callId, roomId: call.roomId, patientId: call.patientId, doctorId: call.doctorId, callType: call.callType });
    console.info('CALL_RINGING', { callId: call.callId, roomId: call.roomId, to: patientObjectId });

    res.status(201).json({ message: 'Call started.', call: payload.call });
  } catch (error) {
    console.error('Start call failed:', error.message);
    res.status(500).json({ message: 'Could not start call.', error: error.message });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const { callId, roomId } = req.body;
    if (!callId) return res.status(400).json({ message: 'Call id is required.' });

    const call = await VideoCall.findById(callId) || await VideoCall.findOne({ callId }).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (String(req.user._id) !== String(call.patientId)) {
      return res.status(403).json({ message: 'Only the intended patient can accept this call.' });
    }

    if (['ended', 'declined', 'missed'].includes(call.status)) {
      return res.status(409).json({ message: 'This call can no longer be accepted.' });
    }

    call.status = 'accepted';
    call.acceptedAt = new Date();
    call.connectedAt = call.connectedAt || new Date();
    if (roomId && !call.roomId) call.roomId = roomId;
    await call.save();

    const io = req.app.get('io');
    const payload = { call, status: 'accepted', event: 'CALL_ACCEPTED' };
    io?.to(`patient_${call.patientId}`).emit('videoCallStatus', payload);
    io?.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', payload);
    if (call.roomId) io?.to(call.roomId).emit('CALL_ACCEPTED', payload);
    console.info('CALL_ACCEPTED', { callId: call.callId, roomId: call.roomId, patientId: call.patientId });

    res.json({ message: 'Call accepted.', call });
  } catch (error) {
    console.error('Accept call failed:', error.message);
    res.status(500).json({ message: 'Could not accept call.', error: error.message });
  }
});

router.post('/decline', async (req, res) => {
  try {
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ message: 'Call id is required.' });

    const call = await VideoCall.findById(callId) || await VideoCall.findOne({ callId }).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (String(req.user._id) !== String(call.patientId)) {
      return res.status(403).json({ message: 'Only the patient can decline this call.' });
    }

    if (['ended', 'declined', 'missed'].includes(call.status)) {
      return res.status(409).json({ message: 'This call was already resolved.' });
    }

    call.status = 'declined';
    call.declinedAt = new Date();
    call.endedAt = new Date();
    await call.save();

    const io = req.app.get('io');
    const payload = { call, status: 'declined', event: 'CALL_DECLINED' };
    io?.to(`patient_${call.patientId}`).emit('videoCallStatus', payload);
    io?.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', payload);
    if (call.roomId) io?.to(call.roomId).emit('CALL_DECLINED', payload);
    console.info('CALL_DECLINED', { callId: call.callId, roomId: call.roomId, patientId: call.patientId });

    res.json({ message: 'Call declined.', call });
  } catch (error) {
    console.error('Decline call failed:', error.message);
    res.status(500).json({ message: 'Could not decline call.', error: error.message });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { callId, status = 'ended' } = req.body;
    if (!callId) return res.status(400).json({ message: 'Call id is required.' });

    const finalStatus = ['ended', 'missed'].includes(status) ? status : 'ended';
    const call = await VideoCall.findById(callId) || await VideoCall.findOne({ callId }).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    const allowed = [String(call.patientId), String(call.doctorId)].includes(String(req.user._id));
    if (!allowed) return res.status(403).json({ message: 'You cannot end this call.' });

    call.status = finalStatus;
    call.endedAt = new Date();
    await VideoCall.findByIdAndUpdate(call._id, {
      status: finalStatus,
      endedAt: call.endedAt
    }, { new: true });

    const io = req.app.get('io');
    const payload = { call: { ...call, status: finalStatus, endedAt: call.endedAt }, status: finalStatus, event: 'CALL_ENDED' };
    io?.to(`patient_${call.patientId}`).emit('videoCallStatus', payload);
    io?.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', payload);
    if (call.roomId) {
      io?.to(call.roomId).emit('video-call-ended', payload);
      io?.to(call.roomId).emit('CALL_ENDED', payload);
    }
    console.info('CALL_ENDED', { callId: call.callId, roomId: call.roomId, status: finalStatus });

    res.json({ message: 'Call ended.', call: payload.call });
  } catch (error) {
    console.error('End call failed:', error.message);
    res.status(500).json({ message: 'Could not end call.', error: error.message });
  }
});

router.get('/:id/status', async (req, res) => {
  try {
    const call = await findCallByReference(req.params.id) || await VideoCall.findOne({ _id: req.params.id }).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });
    if (![String(call.patientId), String(call.doctorId)].includes(String(req.user._id))) {
      return res.status(403).json({ message: 'You are not authorized to view this call.' });
    }
    res.json({ call });
  } catch (error) {
    res.status(500).json({ message: 'Could not load call status.', error: error.message });
  }
});

router.post('/missed', async (req, res) => {
  try {
    const { callId } = req.body;
    if (!callId) return res.status(400).json({ message: 'Call id is required.' });

    const call = await VideoCall.findById(callId) || await VideoCall.findOne({ callId }).lean();
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    if (![String(call.doctorId), String(call.patientId)].includes(String(req.user._id))) {
      return res.status(403).json({ message: 'You are not authorized to close this call.' });
    }

    call.status = 'missed';
    call.endedAt = new Date();
    await VideoCall.findByIdAndUpdate(call._id, {
      status: 'missed',
      endedAt: call.endedAt
    }, { new: true });

    const io = req.app.get('io');
    const payload = { call: { ...call, status: 'missed', endedAt: call.endedAt }, status: 'missed', event: 'CALL_MISSED' };
    io?.to(`patient_${call.patientId}`).emit('videoCallStatus', payload);
    io?.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', payload);
    if (call.roomId) io?.to(call.roomId).emit('CALL_MISSED', payload);
    console.info('CALL_MISSED', { callId: call.callId, roomId: call.roomId, patientId: call.patientId, doctorId: call.doctorId });

    res.json({ message: 'Call marked as missed.', call: payload.call });
  } catch (error) {
    console.error('Missed call update failed:', error.message);
    res.status(500).json({ message: 'Could not mark call as missed.', error: error.message });
  }
});

module.exports = router;
