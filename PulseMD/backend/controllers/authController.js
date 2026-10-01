const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');
const PatientProfile = require('../models/PatientProfile');
const { isTestRegistrationNumber, verifyDoctorDocuments } = require('../utils/doctorVerification');
const { sendEmail } = require('../utils/emailService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authCookieOptions() {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `pulsemd_token=${token}; ${authCookieOptions()}; Max-Age=${7 * 24 * 60 * 60}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `pulsemd_token=; ${authCookieOptions()}; Max-Age=0`);
}

function normalizeEmergencyContact(input) {
  if (!input) return { name: '', phone: '', updatedAt: null };
  if (typeof input === 'object') {
    return {
      name: String(input.name || '').trim(),
      phone: String(input.phone || '').trim(),
      updatedAt: input.name || input.phone ? new Date() : null
    };
  }
  return {
    name: '',
    phone: String(input || '').trim(),
    updatedAt: input ? new Date() : null
  };
}

async function signup(req, res) {
  try {
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    const rawName = String(req.body.name || '').trim();
    const {
      password,
      phone,
      role = 'patient',
      specialty,
      specialization,
      consultationFee,
      bio,
      experienceYears,
      fee,
      degreeName,
      registrationNumber,
      verificationDocuments,
      profileImage,
      city,
      clinic,
      age,
      gender,
      address,
      emergencyContact,
      preferredLanguage,
      selectedLanguage
    } = req.body;
    const name = rawName;
    const email = rawEmail;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be patient, doctor, or admin.' });
    }

    const doctorSpecialty = String(specialty || specialization || '').trim();
    const doctorFee = Number(consultationFee ?? fee ?? 0);
    const patientAge = age === '' || age === undefined || age === null ? null : Number(age);
    const language = ['en', 'hi'].includes(String(preferredLanguage || selectedLanguage || '').toLowerCase())
      ? String(preferredLanguage || selectedLanguage).toLowerCase()
      : 'en';

    if (role === 'patient' && patientAge !== null && (!Number.isFinite(patientAge) || patientAge < 0)) {
      return res.status(400).json({ message: 'Please enter a valid age.' });
    }

    if (role === 'doctor') {
      if (!doctorSpecialty.trim()) {
        return res.status(400).json({ message: 'Specialty is required for doctors.' });
      }

      if (!degreeName?.trim() || !registrationNumber?.trim()) {
        return res.status(400).json({ message: 'Degree name and medical registration number are required for doctor verification.' });
      }

      if (
        !isTestRegistrationNumber(registrationNumber)
        && (
        !verificationDocuments?.degreeCertificate
        || !verificationDocuments?.medicalRegistrationCertificate
        || !verificationDocuments?.idProof
        )
      ) {
        return res.status(400).json({
          message: 'Upload degree certificate, medical registration certificate, and ID proof for doctor verification.'
        });
      }

      if (!Number.isFinite(doctorFee) || doctorFee < 0) {
        return res.status(400).json({ message: 'Consultation fee must be a valid amount.' });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'This email is already registered.' });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone: String(phone || '').trim(),
      role,
      specialty: role === 'doctor' ? doctorSpecialty : '',
      consultationFee: role === 'doctor' ? doctorFee : 0,
      selectedLanguage: language,
      preferredLanguage: language
    });

    try {
      if (role === 'doctor') {
        const verification = verifyDoctorDocuments({
          name,
          degreeName,
          registrationNumber,
          documents: verificationDocuments
        });

        await DoctorProfile.create({
          user: user._id,
          specialization: doctorSpecialty,
          bio: String(bio || '').trim(),
          experienceYears: Number(experienceYears || 0),
          fee: doctorFee,
          city: String(city || '').trim(),
          clinic: String(clinic || '').trim(),
          degreeName: String(degreeName || '').trim(),
          registrationNumber: String(registrationNumber || '').trim(),
          isVerified: verification.isVerified,
          verificationStatus: verification.status,
          verificationMessage: verification.message,
          verifiedAt: verification.verifiedAt,
          verificationChecks: verification.checks,
          verificationReviewedAt: verification.reviewedAt,
          verificationDocuments: {
            degreeCertificate: {
              fileName: verificationDocuments?.degreeCertificate?.fileName || '',
              mimeType: verificationDocuments?.degreeCertificate?.mimeType || '',
              extractedText: verification.extractedText.degreeCertificate
            },
            medicalRegistrationCertificate: {
              fileName: verificationDocuments?.medicalRegistrationCertificate?.fileName || '',
              mimeType: verificationDocuments?.medicalRegistrationCertificate?.mimeType || '',
              extractedText: verification.extractedText.medicalRegistrationCertificate
            },
            idProof: {
              fileName: verificationDocuments?.idProof?.fileName || '',
              mimeType: verificationDocuments?.idProof?.mimeType || '',
              extractedText: verification.extractedText.idProof
            }
          },
          profileImage
        });
      } else if (role === 'patient') {
        await PatientProfile.create({
          user: user._id,
          age: patientAge,
          gender: String(gender || '').trim(),
          address: String(address || '').trim(),
          emergencyContact: normalizeEmergencyContact(emergencyContact)
        });
      }
    } catch (profileError) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw profileError;
    }

    res.status(201).json({
      message: 'Signup successful. Welcome to PulseMD - Virtual Clinic.',
      token: createToken(user),
      user: user.toSafeObject()
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already registered.' });
    }

    res.status(500).json({
      message: `Signup failed: ${error.message}`,
      error: error.message
    });
  }
}

async function login(req, res) {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const query = role ? { email, role } : { email };
    const user = await User.findOne(query);

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);

    res.json({
      token,
      user: {
        ...user.toSafeObject(),
        preferredLanguage: user.preferredLanguage || user.selectedLanguage || 'en',
        selectedLanguage: user.selectedLanguage || user.preferredLanguage || 'en'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed. Please try again.', error: error.message });
  }
}

async function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully.' });
}

async function forgotPassword(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid registered email address.' });
    }

    const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
    if (!user) {
      return res.json({ message: 'If this email is registered, a reset link has been generated.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const configuredOrigin = process.env.CLIENT_ORIGIN && process.env.CLIENT_ORIGIN !== '*'
      ? process.env.CLIENT_ORIGIN
      : '';
    const baseUrl = configuredOrigin || `http://localhost:${process.env.PORT || 5001}`;
    const resetLink = `${baseUrl}/reset-password.html?token=${rawToken}`;
    console.log(`[PulseMD - Virtual Clinic password reset] ${user.email}: ${resetLink}`);

    const mailResult = await sendEmail({
      to: user.email,
      subject: 'Reset your PulseMD - Virtual Clinic password',
      text: [
        `Hello ${user.name || 'PulseMD - Virtual Clinic user'},`,
        '',
        'We received a request to reset your PulseMD - Virtual Clinic password.',
        `Reset your password here: ${resetLink}`,
        '',
        'This link expires in 30 minutes. If you did not request this, you can ignore this email.',
        '',
        'PulseMD - Virtual Clinic - Healthcare that comes to you'
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:560px;margin:auto">
          <h2 style="color:#0FB9B1">Reset your PulseMD - Virtual Clinic password</h2>
          <p>Hello ${escapeEmailHtml(user.name || 'PulseMD - Virtual Clinic user')},</p>
          <p>We received a request to reset your PulseMD - Virtual Clinic password.</p>
          <p><a href="${resetLink}" style="display:inline-block;background:#0FB9B1;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Reset Password</a></p>
          <p style="color:#6B7280">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
          <p>PulseMD - Virtual Clinic - Healthcare that comes to you</p>
        </div>
      `
    });

    res.json({
      message: mailResult.success
        ? 'Password reset link sent to your email.'
        : 'Password reset link generated. Email is not configured, so check the server console for the development reset link.',
      emailSent: mailResult.success
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not generate reset link.', error: error.message });
  }
}

function escapeEmailHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

async function resetPassword(req, res) {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');

    if (!token || !password) {
      return res.status(400).json({ message: 'Reset token and new password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or expired.' });
    }

    user.password = password;
    user.passwordResetToken = '';
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Password updated successfully. Please login with your new password.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not reset password.', error: error.message });
  }
}

module.exports = { signup, login, logout, forgotPassword, resetPassword };
