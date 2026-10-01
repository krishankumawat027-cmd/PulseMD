const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, DoctorProfile, PatientProfile, Notification } = require('../models');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    language: user.language
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'patient', phone, language = 'en', specialty } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' });
    if (!['admin', 'doctor', 'patient'].includes(role)) return res.status(400).json({ message: 'Invalid role.' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already registered.' });

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role,
      phone,
      language
    });

    if (role === 'doctor') {
      await DoctorProfile.create({ user: user._id, specialty: specialty || 'General Medicine' });
      await Notification.create({ user: user._id, role: 'doctor', type: 'verification', title: 'Verification pending', message: 'Upload documents and wait for admin approval.' });
    }
    if (role === 'patient') await PatientProfile.create({ user: user._id });

    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password || '', user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password.' });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
