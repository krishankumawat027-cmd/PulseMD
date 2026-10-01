const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMember',
      default: null,
      index: true
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scheduledAt: {
      type: Date,
      required: true
    },
    reason: {
      type: String,
      trim: true,
      default: ''
    },
    symptomSummary: {
      type: String,
      trim: true,
      default: ''
    },
    symptomHistory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SymptomHistory',
      default: null
    },
    suggestedSpecialty: {
      type: String,
      trim: true,
      default: ''
    },
    urgencyLevel: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'payment_pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending'
    },
    completedAt: {
      type: Date,
      default: null,
      index: true
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    consultationType: {
      type: String,
      enum: ['chat', 'video', 'clinic', 'online'],
      default: 'online'
    },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
