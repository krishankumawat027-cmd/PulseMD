require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const { User, DoctorProfile, PatientProfile, Appointment, Payment, AIUsageLog, EmergencyAlert, Report, Notification } = require('./models');

async function seed() {
  await connectDB();
  await Promise.all([User.deleteMany({}), DoctorProfile.deleteMany({}), PatientProfile.deleteMany({}), Appointment.deleteMany({}), Payment.deleteMany({}), AIUsageLog.deleteMany({}), EmergencyAlert.deleteMany({}), Report.deleteMany({}), Notification.deleteMany({})]);

  const password = await bcrypt.hash('Password@123', 10);
  const admin = await User.create({ name: 'Admin Pulse', email: 'admin@pulsemd.test', password, role: 'admin', phone: '+91 90000 00001' });
  const doctor = await User.create({ name: 'Dr. Sara Khan', email: 'doctor@pulsemd.test', password, role: 'doctor', phone: '+91 90000 00002' });
  const patient = await User.create({ name: 'Rohit Sharma', email: 'patient@pulsemd.test', password, role: 'patient', phone: '+91 90000 00003' });

  await DoctorProfile.create({ user: doctor._id, specialty: 'Cardiology', city: 'Mumbai', fee: 699, status: 'approved', availability: [{ day: 'Mon', start: '10:00', end: '14:00' }, { day: 'Wed', start: '16:00', end: '20:00' }] });
  await PatientProfile.create({ user: patient._id, bloodGroup: 'B+', emergencyContact: { name: 'Amit Sharma', phone: '+91 90000 00004', relation: 'Brother' } });
  const appointment = await Appointment.create({ patient: patient._id, doctor: doctor._id, scheduledAt: new Date(Date.now() + 86400000), reason: 'Chest discomfort follow-up', status: 'confirmed', paymentStatus: 'paid' });
  await Payment.create({ appointment: appointment._id, patient: patient._id, doctor: doctor._id, amount: 699, status: 'paid', transactionId: 'DEMO-PAID-001' });
  await AIUsageLog.create({ patient: patient._id, symptomsText: 'I have fever and headache for two days', summary: 'Fever with headache for two days', urgency: 'medium', possibleConditions: ['Viral fever', 'Migraine'] });
  await EmergencyAlert.create({ patient: patient._id, assignedDoctor: doctor._id, message: 'Demo emergency alert', contactPhone: '+91 90000 00004' });
  await Notification.create({ user: admin._id, role: 'admin', type: 'demo', title: 'Demo data ready', message: 'PulseMD hackathon demo has been seeded.' });

  console.log('Seed complete');
  console.log('admin@pulsemd.test / Password@123');
  console.log('doctor@pulsemd.test / Password@123');
  console.log('patient@pulsemd.test / Password@123');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
