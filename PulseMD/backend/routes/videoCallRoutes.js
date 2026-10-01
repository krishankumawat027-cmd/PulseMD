const express = require('express');
const VideoCall = require('../models/VideoCall');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.post('/start', async (req, res) => {
  try {
    const { patientId, doctorId, appointmentId = null, callType = 'video' } = req.body;
    if (!patientId || !doctorId) {
      return res.status(400).json({ message: 'Patient and doctor are required.' });
    }

    const allowed = [patientId.toString(), doctorId.toString()].includes(req.user._id.toString());
    if (!allowed) return res.status(403).json({ message: 'You cannot start this call.' });

    const roomId = `call:${doctorId}:${patientId}:${Date.now()}`;
    const call = await VideoCall.create({
      patientId,
      doctorId,
      appointmentId,
      roomId,
      callType: callType === 'audio' ? 'audio' : 'video',
      status: 'ringing',
      startedBy: req.user._id
    });

    const io = req.app.get('io');
    io?.to(`patient_${patientId}`).emit('videoCallStatus', { call, status: 'ringing' });
    io?.to(`doctor-notify:${doctorId}`).emit('videoCallStatus', { call, status: 'ringing' });

    res.status(201).json({ message: 'Call started.', call });
  } catch (error) {
    res.status(500).json({ message: 'Could not start call.', error: error.message });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { callId, status = 'ended' } = req.body;
    if (!callId) return res.status(400).json({ message: 'Call id is required.' });

    const finalStatus = ['ended', 'missed'].includes(status) ? status : 'ended';
    const call = await VideoCall.findById(callId);
    if (!call) return res.status(404).json({ message: 'Call not found.' });

    const allowed = [call.patientId.toString(), call.doctorId.toString()].includes(req.user._id.toString());
    if (!allowed) return res.status(403).json({ message: 'You cannot end this call.' });

    call.status = finalStatus;
    call.endedAt = new Date();
    await call.save();

    const io = req.app.get('io');
    io?.to(`patient_${call.patientId}`).emit('videoCallStatus', { call, status: finalStatus });
    io?.to(`doctor-notify:${call.doctorId}`).emit('videoCallStatus', { call, status: finalStatus });
    io?.to(call.roomId).emit('video-call-ended', { callId: call._id, status: finalStatus });

    res.json({ message: 'Call ended.', call });
  } catch (error) {
    res.status(500).json({ message: 'Could not end call.', error: error.message });
  }
});

module.exports = router;
