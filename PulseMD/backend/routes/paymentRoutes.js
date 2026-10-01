const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const { auth, requireRole } = require('../middleware/auth');
const { createDoctorNotification } = require('../utils/doctorNotifications');
const { syncDoctorEarningForAppointment } = require('../utils/earnings');

const router = express.Router();

router.use(auth);

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.');
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// Razorpay sends order_id, payment_id, and signature after checkout.
// The backend must recompute the HMAC with key_secret before unlocking care.
function verifySignature({ orderId, paymentId, signature }) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature.length !== signature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}

router.get('/appointment/:appointmentId', async (req, res) => {
  try {
    const query = { _id: req.params.appointmentId };
    if (req.user.role === 'patient') query.patient = req.user._id;
    if (req.user.role === 'doctor') query.doctor = req.user._id;

    const appointment = await Appointment.findOne(query)
      .populate('doctor', 'name email phone specialty consultationFee')
      .populate('patient', 'name email phone')
      .populate('payment');

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Could not load payment details.', error: error.message });
  }
});

router.post('/create-order', requireRole('patient'), async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'Appointment is required.' });

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: req.user._id
    })
      .populate('doctor', 'name email phone specialty consultationFee')
      .populate('patient', 'name email phone');

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });
    if (appointment.paymentStatus === 'paid') {
      return res.status(409).json({ message: 'This appointment is already paid.' });
    }

    const amount = Number(appointment.consultationFee || appointment.doctor.consultationFee || 0);
    if (!amount || amount < 1) {
      return res.status(400).json({ message: 'Doctor consultation fee is not configured.' });
    }

    const existingPayment = await Payment.findOne({
      appointmentId: appointment._id,
      patientId: req.user._id,
      status: 'created'
    });

    if (existingPayment) {
      existingPayment.patientName = existingPayment.patientName || appointment.patient?.name || req.user.name || 'Patient';
      existingPayment.doctorName = existingPayment.doctorName || appointment.doctor?.name || 'Doctor';
      existingPayment.amount = Number(existingPayment.amount || amount);
      await existingPayment.save();
      return res.json({
        keyId: process.env.RAZORPAY_KEY_ID,
        order: {
          id: existingPayment.orderId,
          amount: existingPayment.amount * 100,
          currency: existingPayment.currency
        },
        payment: existingPayment,
        appointment
      });
    }

    const razorpay = getRazorpayClient();
    // Razorpay expects the amount in paise, so INR 500 becomes 50000.
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `appt_${appointment._id.toString().slice(-18)}`,
      notes: {
        app: 'PulseMD - Virtual Clinic',
        appointmentId: appointment._id.toString(),
        patientId: req.user._id.toString(),
        doctorId: appointment.doctor._id.toString()
      }
    });

    // Store the order before checkout opens. It is marked paid only after signature verification.
    const payment = await Payment.create({
      patientId: req.user._id,
      patientName: appointment.patient?.name || req.user.name || 'Patient',
      doctorId: appointment.doctor._id,
      doctorName: appointment.doctor?.name || 'Doctor',
      appointmentId: appointment._id,
      amount,
      currency: order.currency,
      orderId: order.id,
      paymentStatus: 'created',
      status: 'created',
      notes: 'Razorpay order created. Consultation unlocks after verified payment.'
    });

    res.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      order,
      payment,
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not create Razorpay order.', error: error.message });
  }
});

router.post('/verify-payment', requireRole('patient'), async (req, res) => {
  try {
    const {
      appointmentId,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body;

    if (!appointmentId || !orderId || !paymentId || !signature) {
      return res.status(400).json({ message: 'Payment verification details are incomplete.' });
    }

    const payment = await Payment.findOne({
      appointmentId,
      orderId,
      patientId: req.user._id
    });

    if (!payment) return res.status(404).json({ message: 'Payment order not found.' });
    if (payment.status === 'paid') {
      return res.status(409).json({ message: 'This payment has already been verified.' });
    }

    const isValid = verifySignature({ orderId, paymentId, signature });
    if (!isValid) {
      payment.status = 'failed';
      payment.paymentStatus = 'failed';
      payment.paymentId = paymentId;
      payment.signature = signature;
      payment.paymentDate = new Date();
      await payment.save();

      await Appointment.findOneAndUpdate(
        { _id: appointmentId, patient: req.user._id },
        { paymentStatus: 'failed', status: 'payment_pending' }
      );

      return res.status(400).json({ message: 'Invalid payment signature. Payment verification failed.' });
    }

    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, patient: req.user._id },
      {
        payment: payment._id,
        paymentStatus: 'paid',
        status: 'confirmed'
      },
      { new: true }
    )
      .populate('doctor', 'name email phone specialty consultationFee')
      .populate('patient', 'name email phone')
      .populate('payment');

    payment.status = 'paid';
    payment.paymentStatus = 'paid';
    payment.paymentId = paymentId;
    payment.signature = signature;
    payment.paymentDate = new Date();
    payment.patientName = appointment?.patient?.name || req.user.name || payment.patientName || 'Patient';
    payment.doctorName = appointment?.doctor?.name || payment.doctorName || 'Doctor';
    payment.amount = Number(payment.amount || appointment?.consultationFee || 0);
    await payment.save();

    if (appointment) {
      await syncDoctorEarningForAppointment(appointment._id);
      await createDoctorNotification(req.app, {
        doctorId: appointment.doctor?._id || appointment.doctor,
        patientId: req.user._id,
        patientName: appointment.patient?.name || req.user.name || 'Patient',
        type: 'payment_received',
        title: 'Payment received',
        message: `${appointment.patient?.name || 'A patient'} paid ${payment.currency || 'INR'} ${payment.amount} for a consultation.`,
        relatedAppointmentId: appointment._id
      });
    }

    res.json({
      message: 'Payment verified. Consultation is now unlocked.',
      payment,
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not verify payment.', error: error.message });
  }
});

router.post('/confirm', requireRole('patient'), (req, res) => {
  res.status(410).json({ message: 'Use /api/payment/verify-payment for Razorpay signature verification.' });
});

module.exports = router;
