const EMERGENCY_KEYWORDS = [
  'chest pain',
  'severe breathing',
  'breathing problem',
  'unconscious',
  'unconsciousness',
  'heavy bleeding',
  'stroke',
  'face drooping',
  'seizure'
];

function detectEmergencySymptoms(text = '') {
  const value = String(text || '').toLowerCase();
  return EMERGENCY_KEYWORDS.filter((keyword) => value.includes(keyword));
}

function generateChatbotSummary(preInfo = {}) {
  return [
    'Patient Summary:',
    '',
    `* Name: ${preInfo.name || '-'}`,
    `* Age: ${preInfo.age || '-'}`,
    `* Weight: ${preInfo.weight || '-'}`,
    `* Gender: ${preInfo.gender || '-'}`,
    `* Main Symptoms: ${preInfo.symptoms || '-'}`,
    `* Duration: ${preInfo.duration || '-'}`,
    `* Severity: ${preInfo.severity || '-'}`,
    `* Existing Conditions: ${preInfo.existingDiseases || '-'}`,
    `* Current Medicines: ${preInfo.currentMedicines || '-'}`,
    `* Allergies: ${preInfo.allergies || '-'}`,
    '* Notes: AI collected this information for doctor review only. No diagnosis, prescription, or treatment advice was generated.'
  ].join('\n');
}

module.exports = { EMERGENCY_KEYWORDS, detectEmergencySymptoms, generateChatbotSummary };
