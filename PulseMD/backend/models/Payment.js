const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    patientName: {
      type: String,
      trim: true,
      default: ''
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    doctorName: {
      type: String,
      trim: true,
      default: ''
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true
    },
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConsultationChat',
      default: null,
      index: true
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
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['created', 'pending', 'paid', 'success', 'completed', 'failed', 'refunded'],
      default: 'created'
    },
    status: {
      type: String,
      enum: ['created', 'pending', 'paid', 'success', 'completed', 'failed', 'refunded'],
      default: 'created'
    },
    paymentId: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    signature: {
      type: String,
      trim: true,
      default: ''
    },
    provider: {
      type: String,
      default: 'razorpay'
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
