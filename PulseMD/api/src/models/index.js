const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'doctor', 'patient'], default: 'patient' },
  phone: String,
  language: { type: String, enum: ['en', 'hi'], default: 'en' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const doctorProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true, unique: true },
  specialty: { type: String, default: 'General Medicine' },
  bio: String,
  city: { type: String, default: 'Online' },
  fee: { type: Number, default: 499 },
  experienceYears: { type: Number, default: 5 },
  rating: { type: Number, default: 4.8 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
  documents: [{
    name: String,
    url: String,
    mimeType: String
  }],
  availability: [{
    day: String,
    start: String,
    end: String,
    isActive: { type: Boolean, default: true }
  }],
  payout: {
    upi: String,
    bankAccount: String,
    ifsc: String
  }
}, { timestamps: true });

const patientProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true, unique: true },
  dob: Date,
  gender: String,
  bloodGroup: String,
  medicalNotes: String,
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  }
}, { timestamps: true });

const appointmentSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  doctor: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  scheduledAt: { type: Date, required: true },
  reason: String,
  symptomSummary: String,
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  fallbackNote: String
}, { timestamps: true });

const emergencyAlertSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  assignedDoctor: { type: Schema.Types.ObjectId, ref: 'PulseUser' },
  message: String,
  contactPhone: String,
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' }
}, { timestamps: true });

const paymentSchema = new Schema({
  appointment: { type: Schema.Types.ObjectId, ref: 'PulseAppointment' },
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser' },
  doctor: { type: Schema.Types.ObjectId, ref: 'PulseUser' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  provider: { type: String, default: 'demo' },
  transactionId: String,
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' }
}, { timestamps: true });

const reportSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  doctor: { type: Schema.Types.ObjectId, ref: 'PulseUser' },
  appointment: { type: Schema.Types.ObjectId, ref: 'PulseAppointment' },
  title: { type: String, required: true },
  type: { type: String, enum: ['image', 'pdf', 'audio', 'video', 'file'], default: 'file' },
  fileUrl: String,
  fileName: String,
  mimeType: String,
  notes: String
}, { timestamps: true });

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  role: { type: String, enum: ['admin', 'doctor', 'patient'], required: true },
  type: { type: String, default: 'general' },
  title: String,
  message: String,
  isRead: { type: Boolean, default: false },
  link: String
}, { timestamps: true });

const aiUsageLogSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser' },
  symptomsText: String,
  language: { type: String, default: 'en' },
  summary: String,
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  possibleConditions: [String],
  sentToDoctor: { type: Boolean, default: false }
}, { timestamps: true });

const chatMessageSchema = new Schema({
  appointment: { type: Schema.Types.ObjectId, ref: 'PulseAppointment' },
  sender: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  receiver: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  senderRole: { type: String, enum: ['admin', 'doctor', 'patient'], required: true },
  messageType: { type: String, enum: ['text', 'audio', 'image', 'pdf', 'video', 'file'], default: 'text' },
  text: String,
  fileUrl: String,
  fileName: String,
  mimeType: String
}, { timestamps: true });

const prescriptionSchema = new Schema({
  appointment: { type: Schema.Types.ObjectId, ref: 'PulseAppointment' },
  patient: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  doctor: { type: Schema.Types.ObjectId, ref: 'PulseUser', required: true },
  medicines: [{
    name: String,
    dosage: String,
    timing: String,
    duration: String
  }],
  advice: String,
  notes: String
}, { timestamps: true });

module.exports = {
  User: model('PulseUser', userSchema),
  DoctorProfile: model('PulseDoctorProfile', doctorProfileSchema),
  PatientProfile: model('PulsePatientProfile', patientProfileSchema),
  Appointment: model('PulseAppointment', appointmentSchema),
  EmergencyAlert: model('PulseEmergencyAlert', emergencyAlertSchema),
  Payment: model('PulsePayment', paymentSchema),
  Report: model('PulseReport', reportSchema),
  Notification: model('PulseNotification', notificationSchema),
  AIUsageLog: model('PulseAIUsageLog', aiUsageLogSchema),
  ChatMessage: model('PulseChatMessage', chatMessageSchema),
  Prescription: model('PulsePrescription', prescriptionSchema)
};
