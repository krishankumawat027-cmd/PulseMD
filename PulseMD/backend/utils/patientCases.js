const DoctorProfile = require('../models/DoctorProfile');
const PatientCase = require('../models/PatientCase');
const PatientIntakeRequest = require('../models/PatientIntakeRequest');
const { createDoctorNotification } = require('./doctorNotifications');

function cleanSeverity(value = '') {
  const severity = String(value || '').trim();
  return ['Mild', 'Moderate', 'Severe'].includes(severity) ? severity : 'Mild';
}

function severityToUrgency(severity = '') {
  if (severity === 'Severe') return 'high';
  if (severity === 'Moderate') return 'medium';
  return 'low';
}

function makeAiSummary(info) {
  const weightText = info.weight ? `, weight ${info.weight}` : '';
  const medicinesText = info.currentMedicines ? ` Current medicines: ${info.currentMedicines}.` : '';
  return `Patient ${info.name}, age ${info.age}${weightText}, reports ${info.symptoms} for ${info.duration}. Severity marked as ${info.severity}.${medicinesText} Doctor review required.`;
}

function normalizeAiMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((item) => ({
      sender: ['bot', 'patient', 'system'].includes(item.sender) ? item.sender : 'system',
      text: String(item.text || '').trim(),
      step: String(item.step || '').trim(),
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
    }))
    .filter((item) => item.text);
}

async function findDoctorsForCase({ doctorId, preferredSpecialty }) {
  if (doctorId) return [doctorId];

  const query = {
    $or: [{ isVerified: true }, { verificationStatus: { $in: ['verified', 'Verified'] } }]
  };

  if (preferredSpecialty) {
    query.specialization = new RegExp(preferredSpecialty, 'i');
  }

  const profiles = await DoctorProfile.find(query)
    .sort({ availabilityStatus: 1, updatedAt: -1 })
    .limit(10)
    .select('user availabilityStatus');

  const available = profiles.filter((profile) => profile.availabilityStatus === 'available');
  const selected = available.length ? available : profiles;
  return selected.map((profile) => profile.user);
}

async function createPatientCaseWithNotifications(app, {
  patient,
  doctorId = null,
  appointmentId = null,
  familyMemberId = null,
  preInfo,
  aiSummary = '',
  chatMessages = [],
  preferredSpecialty = '',
  medicalNotes = ''
}) {
  const info = {
    name: String(preInfo.name || patient?.name || '').trim(),
    age: String(preInfo.age || '').trim(),
    weight: String(preInfo.weight || '').trim(),
    gender: String(preInfo.gender || '').trim(),
    symptoms: String(preInfo.symptoms || '').trim(),
    duration: String(preInfo.duration || '').trim(),
    severity: cleanSeverity(preInfo.severity),
    currentMedicines: String(preInfo.currentMedicines || preInfo.medicines || '').trim()
  };

  const summary = aiSummary || makeAiSummary(info);
  const urgencyLevel = severityToUrgency(info.severity);
  const notifiedDoctors = await findDoctorsForCase({ doctorId, preferredSpecialty });
  const primaryDoctor = doctorId || notifiedDoctors[0] || null;

  const patientCase = await PatientCase.create({
    patientId: patient._id,
    familyMemberId: familyMemberId || null,
    patientName: info.name,
    age: info.age,
    weight: info.weight,
    gender: info.gender,
    symptoms: info.symptoms,
    duration: info.duration,
    severity: info.severity,
    urgencyLevel,
    preferredSpecialty: String(preferredSpecialty || '').trim(),
    medicalNotes: String(medicalNotes || '').trim(),
    currentMedicines: info.currentMedicines,
    aiSummary: summary,
    aiChatMessages: normalizeAiMessages(chatMessages),
    appointmentId: appointmentId || null,
    doctorAssigned: primaryDoctor,
    notifiedDoctors,
    notificationSent: false,
    status: 'pending'
  });

  let intakeRequest = null;
  if (primaryDoctor) {
    intakeRequest = await PatientIntakeRequest.create({
      patientId: patient._id,
      familyMemberId: familyMemberId || null,
      doctorId: primaryDoctor,
      appointmentId: appointmentId || null,
      name: info.name,
      age: info.age,
      weight: info.weight,
      gender: info.gender,
      symptoms: info.symptoms,
      duration: info.duration,
      severity: info.severity,
      currentMedicines: info.currentMedicines,
      aiSummary: summary,
      status: 'waiting',
      caseId: patientCase._id,
      aiChatMessages: patientCase.aiChatMessages,
      preferredSpecialty: patientCase.preferredSpecialty,
      urgencyLevel
    });
    patientCase.intakeRequestId = intakeRequest._id;
    await patientCase.save();
  }

  const notifications = [];
  for (const notifyDoctorId of notifiedDoctors) {
    const notification = await createDoctorNotification(app, {
      doctorId: notifyDoctorId,
      patientId: patient._id,
      relatedPatientId: patient._id,
      type: 'new_patient_case',
      title: 'New patient case received',
      message: 'A new AI-screened patient is waiting for doctor review',
      requestId: intakeRequest?._id || null,
      relatedRequestId: intakeRequest?._id || null,
      relatedChatId: String(patientCase._id),
      relatedAppointmentId: appointmentId || null,
      patientName: info.name,
      caseId: patientCase._id,
      urgencyLevel,
      symptoms: info.symptoms
    });
    notifications.push(notification);
  }

  if (notifications.length) {
    patientCase.notificationSent = true;
    await patientCase.save();
  }

  console.info('AI intake saved with summary:', {
    patientId: patient._id.toString(),
    familyMemberId: familyMemberId?.toString?.() || String(familyMemberId || ''),
    doctorId: primaryDoctor?.toString?.() || String(primaryDoctor || ''),
    caseId: patientCase._id.toString(),
    requestId: intakeRequest?._id?.toString?.() || '',
    status: patientCase.status,
    hasAiSummary: Boolean(summary),
    notificationCount: notifications.length
  });

  return { patientCase, intakeRequest, notifications };
}

module.exports = {
  cleanSeverity,
  createPatientCaseWithNotifications,
  makeAiSummary,
  normalizeAiMessages,
  severityToUrgency
};
