const User = require('../models/User');

async function ensureDefaultAdmin() {
  const email = 'admin@gmail.com';
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      existing.name = existing.name || 'PulseMD Admin';
      await existing.save();
      console.log(`Default admin account updated for ${email}`);
    }
    return existing;
  }

  const admin = await User.create({
    name: 'PulseMD Admin',
    email,
    password: '123456',
    role: 'admin'
  });

  console.log(`Default admin account created: ${email}`);
  return admin;
}

module.exports = ensureDefaultAdmin;
