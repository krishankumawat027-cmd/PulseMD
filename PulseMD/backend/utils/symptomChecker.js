const SymptomHistory = require('../models/SymptomHistory');
const FamilyMember = require('../models/FamilyMember');

const MAX_SYMPTOM_TEXT_LENGTH = 2000;

const SYMPTOM_RULES = [
  {
    keywords: ['chest pain', 'breathless', 'shortness of breath', 'left arm pain', 'सीने में दर्द', 'सांस', 'saans', 'chati dard'],
    specialty: 'Cardiologist',
    conditions: ['Chest pain evaluation', 'Breathing difficulty', 'Cardiac risk symptoms'],
    departments: ['Cardiology', 'Emergency Medicine'],
    urgencyLevel: 'High',
    advice: ['Seek urgent medical help immediately.', 'Avoid exertion and keep someone nearby.', 'Use the Emergency button if symptoms are severe.']
  },
  {
    keywords: ['skin rash', 'rash', 'itching', 'acne', 'skin issue', 'दाने', 'खुजली', 'khujli'],
    specialty: 'Dermatologist',
    conditions: ['Skin allergy', 'Rash or irritation', 'Acne or skin infection'],
    departments: ['Dermatology'],
    urgencyLevel: 'Low',
    advice: ['Avoid scratching the affected area.', 'Keep the skin clean and dry.', 'Book a dermatologist if the rash spreads or persists.']
  },
  {
    keywords: ['stomach pain', 'vomiting', 'diarrhea', 'acidity', 'abdominal pain', 'पेट दर्द', 'उल्टी', 'दस्त', 'pet dard', 'ulti'],
    specialty: 'Gastroenterologist',
    conditions: ['Digestive upset', 'Gastric irritation', 'Abdominal infection'],
    departments: ['Gastroenterology', 'General Medicine'],
    urgencyLevel: 'Medium',
    advice: ['Drink fluids in small sips.', 'Avoid oily or spicy food.', 'Consult urgently if pain is severe or there is blood in stool.']
  },
  {
    keywords: ['headache', 'migraine', 'dizziness', 'weakness', 'सिर दर्द', 'चक्कर', 'कमजोरी', 'sar dard', 'chakkar'],
    specialty: 'General Physician',
    conditions: ['Headache or migraine', 'Dehydration or weakness', 'Viral illness'],
    departments: ['General Medicine', 'Neurology'],
    urgencyLevel: 'Medium',
    advice: ['Rest in a quiet place and hydrate.', 'Track fever, vomiting, or vision changes.', 'Consult a doctor if symptoms are sudden or worsening.']
  },
  {
    keywords: ['fever', 'cough', 'cold', 'sore throat', 'flu', 'बुखार', 'खांसी', 'गला', 'bukhar', 'khansi'],
    specialty: 'General Physician',
    conditions: ['Viral fever', 'Upper respiratory infection', 'Seasonal flu'],
    departments: ['General Medicine'],
    urgencyLevel: 'Low',
    advice: ['Rest and drink warm fluids.', 'Monitor temperature regularly.', 'Book a physician if fever persists beyond 2 days or breathing becomes difficult.']
  }
];

function cleanSymptomText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SYMPTOM_TEXT_LENGTH);
}

function normalizeLanguage(value = 'en') {
  const language = String(value || 'en').toLowerCase();
  return language.startsWith('hi') ? 'hi-IN' : 'en-IN';
}

function analyzeSymptoms(symptomText = '', symptoms = []) {
  const combined = `${symptomText} ${symptoms.join(' ')}`.toLowerCase();
  const match = SYMPTOM_RULES.find((rule) => rule.keywords.some((keyword) => combined.includes(keyword.toLowerCase())));
  const analysis = match || {
    specialty: 'General Physician',
    conditions: ['General symptom review', 'Early illness or non-specific symptoms'],
    departments: ['General Medicine'],
    urgencyLevel: 'Low',
    advice: ['Keep a note of symptom duration and severity.', 'Stay hydrated and rest.', 'Book a doctor if symptoms continue or worsen.']
  };

  return {
    summary: makeSummary(symptomText, symptoms, analysis),
    possibleConditions: analysis.conditions,
    urgency: analysis.urgencyLevel,
    urgencyLevel: analysis.urgencyLevel,
    advice: analysis.advice,
    nextAction: analysis.urgencyLevel === 'High'
      ? 'Consult a doctor urgently or use emergency support if symptoms are severe.'
      : 'Consult a doctor if symptoms persist, worsen, or you feel unsafe.',
    suggestedSpecialty: analysis.specialty,
    suggestedDepartments: analysis.departments,
    careAdvice: analysis.advice
  };
}

function makeSummary(symptomText = '', symptoms = [], analysis = {}) {
  const entered = cleanSymptomText(symptomText) || symptoms.join(', ') || 'Symptoms entered';
  return `You reported: ${entered}. PulseMD suggests ${analysis.specialty || 'General Physician'} review with ${analysis.urgencyLevel || 'Low'} urgency.`;
}

async function analyzeAndSaveSymptomCheck({ user, body = {} }) {
  const patientId = String(body.patientId || '').trim();
  if (patientId && patientId !== user._id.toString()) {
    const error = new Error('You can only analyze symptoms for your own patient account.');
    error.status = 403;
    throw error;
  }

  const symptoms = Array.isArray(body.symptoms)
    ? body.symptoms.map((item) => cleanSymptomText(item)).filter(Boolean).slice(0, 12)
    : [];
  const symptomText = cleanSymptomText(body.symptomsText || body.symptomText || '');
  const language = normalizeLanguage(body.language || 'en');
  const familyMemberId = String(body.familyMemberId || '').trim();

  if (!symptomText && !symptoms.length) {
    const error = new Error('Enter symptoms or use voice input before analyzing.');
    error.status = 400;
    throw error;
  }

  let familyMember = null;
  if (familyMemberId) {
    familyMember = await FamilyMember.findOne({ _id: familyMemberId, userId: user._id });
    if (!familyMember) {
      const error = new Error('Family member not found for this account.');
      error.status = 404;
      throw error;
    }
  }

  const analysis = analyzeSymptoms(symptomText, symptoms);
  const history = await SymptomHistory.create({
    patient: user._id,
    familyMemberId: familyMember?._id || null,
    patientName: familyMember?.fullName || user.name || 'Patient',
    symptoms,
    symptomText,
    suggestedSpecialty: analysis.suggestedSpecialty,
    suggestedDepartments: analysis.suggestedDepartments,
    careAdvice: analysis.careAdvice,
    urgencyLevel: analysis.urgencyLevel
  });

  return {
    patientId: user._id,
    language,
    enteredSymptoms: symptomText || symptoms.join(', '),
    summary: analysis.summary,
    possibleConditions: analysis.possibleConditions,
    urgency: analysis.urgency,
    advice: analysis.advice,
    nextAction: analysis.nextAction,
    analysis,
    history,
    disclaimer: history.disclaimer
  };
}

module.exports = {
  MAX_SYMPTOM_TEXT_LENGTH,
  analyzeSymptoms,
  analyzeAndSaveSymptomCheck,
  cleanSymptomText,
  normalizeLanguage
};
