const jwt = require('jsonwebtoken');
const User = require('../models/User');

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const index = entry.indexOf('=');
      if (index === -1) return acc;
      const key = entry.slice(0, index).trim();
      const value = decodeURIComponent(entry.slice(index + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.pulsemd_token || null;
}

async function auth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ message: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }
    next();
  };
}

const authMiddleware = auth;
const adminMiddleware = requireRole('admin');

module.exports = { auth, requireRole, authMiddleware, adminMiddleware, parseCookies, getTokenFromRequest };
