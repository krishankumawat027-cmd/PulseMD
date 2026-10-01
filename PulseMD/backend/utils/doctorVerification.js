function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/dr\.?|doctor/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compact(value = '') {
  return normalize(value).replace(/\s+/g, '');
}

function decodeDocumentText(document = {}) {
  const source = document.content || document.dataUrl || document.text || '';
  if (!source) return '';

  if (document.text && !document.content && !document.dataUrl) {
    return String(document.text);
  }

  const base64 = String(source).includes(',')
    ? String(source).split(',').pop()
    : String(source);

  try {
    const raw = Buffer.from(base64, 'base64').toString('utf8');
    return raw
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (error) {
    return '';
  }
}

function includesValue(text, value) {
  const normalizedText = normalize(text);
  const normalizedValue = normalize(value);
  if (!normalizedText || !normalizedValue) return false;

  return normalizedText.includes(normalizedValue) || compact(normalizedText).includes(compact(normalizedValue));
}

function getTestVerification(registrationNumber = '') {
  const normalized = String(registrationNumber).trim().toUpperCase();
  const now = new Date();

  if (normalized === 'TEST12345') {
    return {
      isVerified: true,
      status: 'verified',
      message: 'Test doctor auto verified',
      verifiedAt: now,
      reviewedAt: now,
      checks: {
        nameMatched: true,
        degreeMatched: true,
        registrationMatched: true,
        readableDocuments: true
      },
      extractedText: {
        degreeCertificate: 'Test doctor degree certificate',
        medicalRegistrationCertificate: 'TEST12345',
        idProof: 'Test doctor ID proof'
      }
    };
  }

  if (normalized === 'PENDING123') {
    return {
      isVerified: false,
      status: 'pending_review',
      message: 'Test case for pending review',
      verifiedAt: null,
      reviewedAt: now,
      checks: {
        nameMatched: false,
        degreeMatched: false,
        registrationMatched: true,
        readableDocuments: false
      },
      extractedText: {
        degreeCertificate: '',
        medicalRegistrationCertificate: 'PENDING123',
        idProof: ''
      }
    };
  }

  if (normalized === 'REJECT123') {
    return {
      isVerified: false,
      status: 'rejected',
      message: 'Test case rejected',
      verifiedAt: null,
      reviewedAt: now,
      checks: {
        nameMatched: false,
        degreeMatched: false,
        registrationMatched: true,
        readableDocuments: false
      },
      extractedText: {
        degreeCertificate: '',
        medicalRegistrationCertificate: 'REJECT123',
        idProof: ''
      }
    };
  }

  return null;
}

function isTestRegistrationNumber(registrationNumber = '') {
  return Boolean(getTestVerification(registrationNumber));
}

function verifyDoctorDocuments({ name, degreeName, registrationNumber, documents = {} }) {
  const testVerification = getTestVerification(registrationNumber);
  if (testVerification) return testVerification;

  const degreeText = decodeDocumentText(documents.degreeCertificate);
  const registrationText = decodeDocumentText(documents.medicalRegistrationCertificate);
  const idText = decodeDocumentText(documents.idProof);
  const combinedText = [degreeText, registrationText, idText].filter(Boolean).join(' ');

  const checks = {
    nameMatched: includesValue(combinedText, name),
    degreeMatched: includesValue(degreeText || combinedText, degreeName),
    registrationMatched: includesValue(registrationText || combinedText, registrationNumber),
    readableDocuments: Boolean(degreeText && registrationText && idText)
  };

  const verified = checks.nameMatched
    && checks.degreeMatched
    && checks.registrationMatched
    && checks.readableDocuments;

  return {
    isVerified: verified,
    status: verified ? 'verified' : 'pending_review',
    message: verified ? 'Doctor documents verified automatically' : 'Verification pending review',
    verifiedAt: verified ? new Date() : null,
    checks,
    extractedText: {
      degreeCertificate: degreeText,
      medicalRegistrationCertificate: registrationText,
      idProof: idText
    },
    reviewedAt: new Date()
  };
}

module.exports = {
  isTestRegistrationNumber,
  verifyDoctorDocuments
};
