const mongoose = require('mongoose');

const doctorEarningSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null
    },
    consultationType: {
      type: String,
      enum: ['chat', 'video', 'clinic', 'online'],
      default: 'online'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true
    },
    consultationStatus: {
      type: String,
      enum: ['pending', 'payment_pending', 'confirmed', 'completed', 'cancelled'],
      default: 'completed',
      index: true
    },
    earnedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

doctorEarningSchema.index({ doctor: 1, appointment: 1 }, { unique: true });

module.exports = mongoose.model('DoctorEarning', doctorEarningSchema);
