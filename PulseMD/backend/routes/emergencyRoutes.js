const express = require('express');
const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const EmergencyRequest = require('../models/EmergencyRequest');
const FamilyMember = require('../models/FamilyMember');
const PatientProfile = require('../models/PatientProfile');
const { auth, requireRole } = require('../middleware/auth');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { createPatientNotification } = require('../utils/patientNotifications');
const { normalizeIndianMobile, placeTwilioVoiceCall, sendSms } = require('../utils/smsService');
const { makeGoogleMapsLink } = require('../services/locationService');

const router = express.Router();

const PHONE_RE = /^[6-9]\d{9}$|^\+91[6-9]\d{9}$/;
const EMERGENCY_TYPES = ['ambulance', 'emergency_contact', 'nearest_hospital', 'quick_alert', 'emergency_help', 'one_button'];
const ONE_BUTTON_ACTIONS = ['ambulance', 'emergency_contact', 'share_location', 'sos_message', 'nearest_hospital', 'emergency_chat'];
const SOS_LOCK_WINDOW_MS = Number(process.env.SOS_LOCK_WINDOW_MS || 45000);

function cleanPhone(value) {
  return String(value || '').replace(/[\s-]/g, '').trim();
}

function validateContact(name, phone) {
  const cleanName = String(name || '').trim();
  const clean = cleanPhone(phone);
  if (!cleanName) return { error: 'Emergency contact name is required.' };
  if (!PHONE_RE.test(clean)) return { error: 'Enter a valid Indian mobile number.' };
  return { contact: { name: cleanName, phone: clean, updatedAt: new Date() } };
}

function normalizeEmergencyContact(contact) {
  if (!contact) return { name: '', phone: '' };
  if (typeof contact === 'string') return { name: '', phone: contact };
  return {
    name: String(contact.name || '').trim(),
    phone: cleanPhone(contact.phone)
  };
}

function addSmsRecipient(recipients, seen, phone, name, type) {
  const clean = normalizeIndianMobile(phone);
  if (!clean || seen.has(clean)) return;
  seen.add(clean);
  recipients.push({
    phone: clean,
    name: String(name || '').trim(),
    type
  });
}

async function collectEmergencySmsRecipients(patientId, profile, contact) {
  const recipients = [];
  const seen = new Set();

  addSmsRecipient(recipients, seen, contact?.phone, contact?.name || 'Emergency contact', 'saved_contact');

  const [familyMembers, appointments] = await Promise.all([
    FamilyMember.find({
      userId: patientId,
      emergencyContact: { $exists: true, $nin: ['', null] }
    }).select('fullName relation emergencyContact').lean(),
    Appointment.find({
      patient: patientId,
      doctor: { $exists: true, $ne: null },
      status: { $in: ['confirmed', 'completed', 'pending', 'payment_pending'] }
    })
      .populate('doctor', 'name phone role')
      .sort({ scheduledAt: -1 })
      .limit(10)
      .lean()
  ]);

  familyMembers.forEach((member) => {
    addSmsRecipient(
      recipients,
      seen,
      member.emergencyContact,
      member.fullName || member.relation || 'Family contact',
      'family'
    );
  });

  appointments.forEach((appointment) => {
    addSmsRecipient(
      recipients,
      seen,
      appointment.doctor?.phone,
      appointment.doctor?.name || 'Doctor',
      'doctor'
    );
  });

  return recipients;
}

function buildEmergencySmsMessage({ mapsUrl, latitude, longitude }) {
  const locationText = mapsUrl || (
    latitude !== null && longitude !== null
      ? makeGoogleMapsLink(latitude, longitude)
      : 'Location unavailable'
  );

  return `\u{1F6A8} EMERGENCY ALERT!\nUser needs urgent help.\nLocation: ${locationText}`;
}

function buildEmergencyVoiceMessage({ patientName, mapsUrl }) {
  const patientLabel = patientName ? `${patientName} needs urgent help.` : 'A PulseMD user needs urgent help.';
  const locationLabel = mapsUrl ? 'Their live Google Maps location was sent by SMS.' : 'Live location was not available.';
  return `Emergency alert from PulseMD. ${patientLabel} ${locationLabel} Please respond immediately.`;
}

async function findRecentSos(patientId) {
  if (!Number.isFinite(SOS_LOCK_WINDOW_MS) || SOS_LOCK_WINDOW_MS <= 0) return null;
  return EmergencyRequest.findOne({
    patient: patientId,
    status: 'ACTIVE',
    createdAt: { $gte: new Date(Date.now() - SOS_LOCK_WINDOW_MS) }
  }).sort({ createdAt: -1 });
}

async function sendEmergencySmsAlert({ patientId, patientName, profile, contact, location, emergencyId }) {
  const recipients = await collectEmergencySmsRecipients(patientId, profile, contact);
  if (!recipients.length) {
    return {
      success: false,
      status: 'skipped',
      count: 0,
      recipients,
      message: 'No saved family, emergency contact, or doctor phone numbers found for SMS.'
    };
  }

  const message = buildEmergencySmsMessage({
    patientName,
    mapsUrl: location?.mapsUrl || '',
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    emergencyId
  });
  const result = await sendSms({
    to: recipients.map((recipient) => recipient.phone),
    message,
    context: {
      patientName,
      mapsUrl: location?.mapsUrl || '',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      emergencyId
    }
  });

  const voiceCall = await placeTwilioVoiceCall({
    to: contact?.phone,
    message: buildEmergencyVoiceMessage({
      patientName,
      mapsUrl: location?.mapsUrl || ''
    })
  });

  return {
    ...result,
    recipients: recipients.map((recipient) => ({
      type: recipient.type,
      name: recipient.name,
      phone: recipient.phone
    })),
    alertMessage: message,
    voiceCall
  };
}

async function saveEmergencyContact(req, res) {
  try {
    const { error, contact } = validateContact(req.body.name, req.body.phone);
    if (error) return res.status(400).json({ message: error });

    const profile = await PatientProfile.findOneAndUpdate(
      { user: req.user._id },
      { emergencyContact: contact },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate('user', 'name email phone role');

    res.json({ message: 'Emergency contact saved successfully.', emergencyContact: profile.emergencyContact, profile });
  } catch (error) {
    res.status(500).json({ message: 'Could not save emergency contact.', error: error.message });
  }
}

router.post('/add', auth, requireRole('patient'), saveEmergencyContact);
router.post('/update', auth, requireRole('patient'), saveEmergencyContact);

router.post('/trigger', auth, requireRole('patient'), async (req, res) => {
  try {
    const type = String(req.body.type || 'emergency_help').trim();
    if (!EMERGENCY_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Invalid emergency type.' });
    }

    const profile = await PatientProfile.findOne({ user: req.user._id });
    const contact = normalizeEmergencyContact(profile?.emergencyContact);
    const needsSavedContact = ['emergency_contact'].includes(type);
    if (needsSavedContact && !contact.phone) {
      return res.status(400).json({ message: 'Add an emergency contact in your profile before calling your saved contact.' });
    }

    const recentSos = await findRecentSos(req.user._id);
    if (recentSos) {
      return res.status(429).json({
        message: 'SOS is already active. Please wait before sending another emergency alert.',
        emergency: recentSos
      });
    }

    const location = req.body.location || {};
    const latitude = Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null;
    const longitude = Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null;
    const mapsUrl = latitude !== null && longitude !== null ? makeGoogleMapsLink(latitude, longitude) : '';
    const emergency = await EmergencyRequest.create({
      patient: req.user._id,
      patientName: req.user.name || 'Patient',
      type,
      status: 'ACTIVE',
      message: String(req.body.message || 'Emergency help requested from PulseMD - Virtual Clinic dashboard.').trim(),
      emergencyContactName: contact.name,
      emergencyContactPhone: contact.phone,
      location: {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
        mapsUrl
      },
      selectedActions: [type],
      actionLogs: [{
        action: type,
        status: type === 'emergency_contact' && !contact.phone ? 'failed' : 'success',
        message: !contact.phone
          ? 'Emergency logged without a saved contact. Available doctors were notified.'
          : 'Emergency action triggered.'
      }]
    });

    console.log(`[PulseMD - Virtual Clinic emergency alert] Patient ${req.user.name || req.user._id} triggered ${type}. Request ${emergency._id}`);
    const smsResult = await sendEmergencySmsAlert({
      patientId: req.user._id,
      patientName: req.user.name || 'Patient',
      profile,
      contact,
      location: emergency.location,
      emergencyId: emergency._id
    });

    emergency.actionLogs.push({
      action: 'sms_alert',
      status: smsResult.success ? 'success' : smsResult.status === 'skipped' ? 'pending' : 'failed',
      message: smsResult.success
        ? `SMS alert accepted for ${smsResult.count || smsResult.recipients?.length || 0} saved contact(s).`
        : smsResult.message || 'SMS alert could not be sent.'
    });
    emergency.actionLogs.push({
      action: 'voice_call',
      status: smsResult.voiceCall?.success ? 'success' : smsResult.voiceCall?.status === 'skipped' ? 'pending' : 'failed',
      message: smsResult.voiceCall?.message || 'Emergency voice call could not be queued.'
    });
    await emergency.save();

    const doctors = await DoctorProfile.find({
      availabilityStatus: { $in: ['available', 'busy'] },
      $or: [{ isVerified: true }, { verificationStatus: { $in: ['verified', 'Verified'] } }]
    }).populate('user', 'name email phone role');

    await Promise.all(doctors
      .filter((doctor) => doctor.user?._id)
      .map((doctor) => createDoctorNotification(req.app, {
        doctorId: doctor.user._id,
        patientId: req.user._id,
        patientName: req.user.name || 'Patient',
        type: 'emergency_alert',
        title: 'Emergency help requested',
        message: `${req.user.name || 'A patient'} triggered emergency help. Please review immediately.`,
        relatedChatId: emergency._id.toString(),
        symptomSummary: emergency.message,
        urgencyLevel: 'Severe'
      })));

    res.status(201).json({
      message: doctors.length
        ? smsResult.success
          ? `Emergency alert sent. SMS accepted for ${smsResult.count || smsResult.recipients?.length || 0} saved contact(s), and available doctors were notified.`
          : `Emergency alert sent to available doctors. ${smsResult.message || 'SMS alert could not be sent.'}`
        : smsResult.success
          ? `Emergency saved. SMS accepted for ${smsResult.count || smsResult.recipients?.length || 0} saved contact(s). No doctors are currently online.`
          : `Emergency saved. ${smsResult.message || 'SMS alert could not be sent.'}`,
      emergency,
      mapsUrl,
      notifiedDoctors: doctors.length,
      sms: smsResult,
      voiceCall: smsResult.voiceCall
    });
  } catch (error) {
    console.error('Emergency trigger failed:', error);
    res.status(500).json({ message: 'Could not trigger emergency help.', error: error.message });
  }
});

router.post('/activate', auth, requireRole('patient'), async (req, res) => {
  try {
    const selectedActions = Array.isArray(req.body.actions) && req.body.actions.length
      ? req.body.actions.filter((action) => ONE_BUTTON_ACTIONS.includes(action))
      : ONE_BUTTON_ACTIONS;

    if (!selectedActions.length) {
      return res.status(400).json({ message: 'Select at least one emergency action.' });
    }

    const recentSos = await findRecentSos(req.user._id);
    if (recentSos) {
      return res.status(429).json({
        message: 'SOS is already active. Please wait before sending another emergency alert.',
        emergency: recentSos
      });
    }

    const profile = await PatientProfile.findOne({ user: req.user._id });
    const contact = normalizeEmergencyContact(profile?.emergencyContact);
    const location = req.body.location || {};
    const latitude = Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null;
    const longitude = Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null;
    const mapsUrl = latitude !== null && longitude !== null ? makeGoogleMapsLink(latitude, longitude) : '';
    const actionLogs = [];

    if (selectedActions.includes('share_location')) {
      actionLogs.push({
        action: 'share_location',
        status: mapsUrl ? 'success' : 'failed',
        message: mapsUrl || 'Location permission was not available.'
      });
    }

    if (selectedActions.includes('ambulance')) {
      actionLogs.push({ action: 'ambulance', status: 'pending', message: 'Ambulance call shortcut shown to patient.' });
    }

    if (selectedActions.includes('nearest_hospital')) {
      actionLogs.push({ action: 'nearest_hospital', status: 'success', message: 'Nearby hospital map shortcut prepared.' });
    }

    if (selectedActions.includes('emergency_chat')) {
      actionLogs.push({ action: 'emergency_chat', status: 'success', message: 'Available doctors notified for emergency support.' });
    }

    const emergency = await EmergencyRequest.create({
      patient: req.user._id,
      patientName: req.user.name || 'Patient',
      type: 'one_button',
      status: 'ACTIVE',
      message: String(req.body.message || 'One-button emergency mode activated.').trim(),
      emergencyContactName: contact.name,
      emergencyContactPhone: contact.phone,
      location: {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
        mapsUrl
      },
      selectedActions,
      actionLogs
    });

    const shouldSmsAlert = selectedActions.includes('emergency_contact')
      || selectedActions.includes('sos_message')
      || selectedActions.includes('share_location')
      || selectedActions.includes('emergency_chat');
    const smsResult = shouldSmsAlert
      ? await sendEmergencySmsAlert({
        patientId: req.user._id,
        patientName: req.user.name || 'Patient',
        profile,
        contact,
        location: emergency.location,
        emergencyId: emergency._id
      })
      : { success: false, status: 'skipped', count: 0, recipients: [], message: 'SMS alert was not selected.' };

    emergency.actionLogs.push({
      action: 'sms_alert',
      status: smsResult.success ? 'success' : smsResult.status === 'skipped' ? 'pending' : 'failed',
      message: smsResult.success
        ? `SMS alert accepted for ${smsResult.count || smsResult.recipients?.length || 0} saved contact(s).`
        : smsResult.message || 'SMS alert could not be sent.'
    });
    emergency.actionLogs.push({
      action: 'voice_call',
      status: smsResult.voiceCall?.success ? 'success' : smsResult.voiceCall?.status === 'skipped' ? 'pending' : 'failed',
      message: smsResult.voiceCall?.message || 'Emergency voice call could not be queued.'
    });
    await emergency.save();

    const doctors = await DoctorProfile.find({
      availabilityStatus: { $in: ['available', 'busy'] },
      $or: [{ isVerified: true }, { verificationStatus: { $in: ['verified', 'Verified'] } }]
    }).populate('user', 'name email phone role');

    await Promise.all(doctors
      .filter((doctor) => doctor.user?._id)
      .map((doctor) => createDoctorNotification(req.app, {
        doctorId: doctor.user._id,
        patientId: req.user._id,
        patientName: req.user.name || 'Patient',
        type: 'emergency_alert',
        title: 'Emergency mode active',
        message: `${req.user.name || 'A patient'} activated one-button emergency mode.`,
        relatedChatId: emergency._id.toString(),
        symptomSummary: emergency.message,
        urgencyLevel: 'Severe'
      })));

    req.app.get('io')?.to(`patient_${req.user._id}`).emit('patientNotification', {
      type: 'emergency_active',
      emergencyId: emergency._id,
      createdAt: new Date()
    });

    res.status(201).json({
      message: smsResult.success
        ? `Emergency mode is active. SMS alert accepted for ${smsResult.count || smsResult.recipients?.length || 0} saved contact(s).`
        : `Emergency mode is active. ${smsResult.message || 'SMS alert could not be sent.'}`,
      emergency,
      mapsUrl,
      notifiedDoctors: doctors.length,
      sms: smsResult,
      voiceCall: smsResult.voiceCall
    });
  } catch (error) {
    console.error('One-button emergency activation failed:', error);
    res.status(500).json({ message: 'Could not activate emergency mode.', error: error.message });
  }
});

router.get('/mine', auth, requireRole('patient'), async (req, res) => {
  try {
    const emergencies = await EmergencyRequest.find({ patient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(emergencies);
  } catch (error) {
    res.status(500).json({ message: 'Could not load emergency history.', error: error.message });
  }
});

router.patch('/:id/stop', auth, requireRole('patient'), async (req, res) => {
  try {
    const status = String(req.body.status || 'CANCELLED').toUpperCase();
    if (!['CANCELLED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ message: 'Emergency can only be stopped as cancelled or closed.' });
    }

    const emergency = await EmergencyRequest.findOneAndUpdate(
      { _id: req.params.id, patient: req.user._id },
      {
        status,
        closedAt: new Date(),
        $push: {
          actionLogs: {
            action: 'stop_emergency',
            status: 'success',
            message: `Patient stopped emergency mode as ${status.toLowerCase()}.`
          }
        }
      },
      { new: true }
    );

    if (!emergency) return res.status(404).json({ message: 'Emergency request not found.' });
    res.json({ message: 'Emergency mode stopped.', emergency });
  } catch (error) {
    res.status(500).json({ message: 'Could not stop emergency mode.', error: error.message });
  }
});

router.get('/active', auth, requireRole('doctor'), async (req, res) => {
  try {
    const emergencies = await EmergencyRequest.find({ status: 'ACTIVE' })
      .populate('patient', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(emergencies);
  } catch (error) {
    res.status(500).json({ message: 'Could not load active emergencies.', error: error.message });
  }
});

router.patch('/:id/status', auth, requireRole('doctor'), async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['HANDLED', 'RESOLVED', 'CLOSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid emergency status.' });
    }

    const update = {
      status,
      handledBy: req.user._id
    };
    if (status === 'HANDLED' || status === 'RESOLVED') update.handledAt = new Date();
    if (status === 'RESOLVED' || status === 'CLOSED' || status === 'CANCELLED') update.closedAt = new Date();

    const emergency = await EmergencyRequest.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patient', 'name email phone');
    if (!emergency) return res.status(404).json({ message: 'Emergency request not found.' });

    await createPatientNotification(req.app, {
      patientId: emergency.patient._id || emergency.patient,
      type: 'emergency_update',
      title: `Emergency marked ${status.toLowerCase()}`,
      message: `Your emergency request was marked ${status.toLowerCase()} by a doctor.`,
      relatedEmergencyId: emergency._id
    });

    res.json({ message: `Emergency marked ${status.toLowerCase()}.`, emergency });
  } catch (error) {
    res.status(500).json({ message: 'Could not update emergency status.', error: error.message });
  }
});

module.exports = router;
