const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const User = require('./models/User');
const Message = require('./models/Message');
const Appointment = require('./models/Appointment');
const DoctorProfile = require('./models/DoctorProfile');
const EmergencyRequest = require('./models/EmergencyRequest');
const FamilyMember = require('./models/FamilyMember');
const PatientProfile = require('./models/PatientProfile');
const ConsultationChat = require('./models/ConsultationChat');
const { auth } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const chatRoutes = require('./routes/chatRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const aiIntakeRoutes = require('./routes/aiIntakeRoutes');
const aiChatRoutes = require('./routes/aiChatRoutes');
const caseRoutes = require('./routes/caseRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const smsRoutes = require('./routes/smsRoutes');
const locationRoutes = require('./routes/locationRoutes');
const videoCallRoutes = require('./routes/videoCallRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const wearableRoutes = require('./routes/wearableRoutes');
const familyRoutes = require('./routes/familyRoutes');
const symptomCheckerRoutes = require('./routes/symptomCheckerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ensureDefaultAdmin = require('./utils/ensureDefaultAdmin');
const { authMiddleware, adminMiddleware } = require('./middleware/authMiddleware');
const { getAvailabilityState } = require('./utils/availability');
const { createDoctorNotification } = require('./utils/doctorNotifications');
const { createPatientNotification } = require('./utils/patientNotifications');
const { sendEmail } = require('./utils/emailService');
const { getTokenFromRequest } = require('./middleware/auth');
const {
  getDoctorEarningsSummary,
  getDoctorEarningsHistory,
  getDoctorEarningsChart
} = require('./utils/earnings');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/ai-intake', aiIntakeRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/case', caseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/sms', smsRoutes);

function sosMapsLink(location = {}) {
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

function sosMessage(location = {}) {
  return `\u{1F6A8} EMERGENCY ALERT!\nUser needs urgent help.\nLocation: ${sosMapsLink(location) || 'Location unavailable'}`;
}

async function collectSosNumbers(userId, providedNumbers) {
  const { normalizeRecipients } = require('./utils/smsService');
  const explicit = normalizeRecipients(providedNumbers);
  if (explicit.length) return explicit;

  const numbers = new Set();
  const addMany = (value) => normalizeRecipients(value).forEach((number) => numbers.add(number));
  const [profile, familyMembers, appointments] = await Promise.all([
    PatientProfile.findOne({ user: userId }).lean(),
    FamilyMember.find({ userId, emergencyContact: { $exists: true, $nin: ['', null] } }).select('emergencyContact').lean(),
    Appointment.find({
      patient: userId,
      doctor: { $exists: true, $ne: null },
      status: { $in: ['confirmed', 'completed', 'pending', 'payment_pending'] }
    }).populate('doctor', 'phone').sort({ scheduledAt: -1 }).limit(10).lean()
  ]);

  const contact = typeof profile?.emergencyContact === 'string'
    ? { phone: profile.emergencyContact }
    : profile?.emergencyContact || {};
  addMany(contact.phone);
  familyMembers.forEach((member) => addMany(member.emergencyContact));
  appointments.forEach((appointment) => addMany(appointment.doctor?.phone));
  return [...numbers];
}

app.post('/send-sos', auth, async (req, res) => {
  const { sendFast2Sms, normalizeRecipients } = require('./utils/smsService');
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ message: 'Only patients can send SOS alerts.' });
    }

    const location = req.body.location || {};
    const mapsUrl = sosMapsLink(location);
    const message = String(req.body.message || sosMessage(location)).trim();
    const numbers = await collectSosNumbers(req.user._id, req.body.numbers || req.body.to);
    const validNumbers = normalizeRecipients(numbers);

    if (!validNumbers.length) {
      return res.status(400).json({ message: 'At least one valid SOS phone number is required.' });
    }

    if (!message || !message.includes('Location:') || (!mapsUrl && !/https:\/\/maps\.google\.com\/\?q=/i.test(message))) {
      return res.status(400).json({ message: 'SOS message with a Google Maps location link is required.' });
    }

    const lockWindowMs = Number(process.env.SOS_LOCK_WINDOW_MS || 45000);
    if (Number.isFinite(lockWindowMs) && lockWindowMs > 0) {
      const recentSos = await EmergencyRequest.findOne({
        patient: req.user._id,
        status: 'ACTIVE',
        createdAt: { $gte: new Date(Date.now() - lockWindowMs) }
      }).sort({ createdAt: -1 });
      if (recentSos) {
        return res.status(429).json({
          success: false,
          message: 'SOS is already active. Please wait before sending another emergency alert.',
          emergency: recentSos
        });
      }
    }

    const emergency = await EmergencyRequest.create({
      patient: req.user._id,
      patientName: req.user.name || 'Patient',
      type: 'emergency_help',
      status: 'ACTIVE',
      message,
      emergencyContactPhone: validNumbers[0] || '',
      location: {
        latitude: Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
        longitude: Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
        accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
        mapsUrl
      },
      selectedActions: ['sos_message', 'share_location'],
      actionLogs: [{
        action: 'send_sos',
        status: 'pending',
        message: `Sending SOS SMS to ${validNumbers.length} contact(s).`
      }]
    });

    const result = await sendFast2Sms({ to: validNumbers, message });
    emergency.actionLogs.push({
      action: 'fast2sms_alert',
      status: result.success ? 'success' : 'failed',
      message: result.success
        ? `Fast2SMS accepted SOS SMS for ${result.count || validNumbers.length} contact(s).`
        : result.message || 'Fast2SMS SOS SMS failed.'
    });
    await emergency.save();

    console.log(`[PulseMD SOS] Patient ${req.user._id} sent SOS ${emergency._id}. Fast2SMS status: ${result.status}`);
    return res.status(result.success ? 200 : 502).json({
      success: result.success,
      message: result.success ? 'SOS alert sent successfully.' : result.message || 'SOS alert failed.',
      emergency,
      mapsUrl,
      sms: result
    });
  } catch (error) {
    console.error('SOS alert failed:', error);
    return res.status(500).json({ success: false, message: 'Could not send SOS alert.', error: error.message });
  }
});

app.post('/send-emergency', auth, async (req, res) => {
  const { sendSms } = require('./utils/smsService');
  try {
    const numbers = String(req.body.numbers || req.body.to || '').trim();
    const message = String(req.body.message || '').trim();

    if (!numbers || !message) {
      return res.status(400).json({ message: 'Phone number(s) and emergency message are required.' });
    }

    const result = await sendSms({ to: numbers, message });
    return res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Could not send emergency SMS.', error: error.message });
  }
});
app.use('/api/location', locationRoutes);
app.use('/api/video-call', videoCallRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/upload', uploadRoutes);
app.use('/api/wearables', wearableRoutes);
app.use('/api/family-members', familyRoutes);
app.use('/api/symptom-checker', symptomCheckerRoutes);
app.use('/api/admin', adminRoutes);
app.set('io', io);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'pulsemd-virtual-clinic-api' });
});

app.get('/api/config/maps', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY || '';
  const configured = Boolean(key && !/^(your_|replace_|add_|AIzaSy-your)/i.test(key));
  res.json({
    googleMapsApiKey: configured ? key : '',
    configured
  });
});

app.get('/admin-login', (req, res) => {
  res.redirect('/admin-login.html');
});

app.get('/admin', async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.redirect('/admin-login.html');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('role');
    if (!user || user.role !== 'admin') {
      return res.redirect('/admin-login.html');
    }

    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  } catch (error) {
    res.redirect('/admin-login.html');
  }
});

app.get('/api/patients', auth, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can load patient lists.' });
    }

    const profile = await DoctorProfile.findOne({ user: req.user._id }).select('isVerified verificationStatus');
    if (!profile?.isVerified && !['verified', 'Verified'].includes(profile?.verificationStatus)) {
      return res.status(403).json({ message: 'Your verification is pending or rejected. Access is limited.' });
    }

    const appointments = await Appointment.find({ doctor: req.user._id })
      .populate('patient', 'name email phone')
      .populate('payment')
      .sort({ scheduledAt: -1 });

    const seen = new Set();
    const patients = appointments
      .filter((appointment) => {
        const id = appointment.patient?._id?.toString();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((appointment) => ({
        patient: appointment.patient,
        issue: appointment.reason || 'General consultation',
        status: appointment.status === 'confirmed' ? 'active' : 'waiting',
        appointment
      }));

    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Could not load patients.', error: error.message });
  }
});

app.get('/api/earnings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ message: 'Only doctors can load earnings.' });
    }

    res.json({
      summary: await getDoctorEarningsSummary(req.user._id),
      chart: await getDoctorEarningsChart(req.user._id, req.query),
      transactions: await getDoctorEarningsHistory(req.user._id, req.query)
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load earnings.', error: error.message });
  }
});

app.get('/test-email', async (req, res) => {
  try {
    const to = req.query.to || process.env.EMAIL_TEST_TO || process.env.EMAIL_USER;
    if (!to) {
      return res.status(400).json({ message: 'Set EMAIL_USER or pass ?to=email@example.com to test email sending.' });
    }

    const result = await sendEmail({
      to,
      subject: 'PulseMD - Virtual Clinic email test',
      text: 'This is a PulseMD - Virtual Clinic Nodemailer test email.',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
          <h2 style="color:#0FB9B1">PulseMD - Virtual Clinic Email Test</h2>
          <p>Your Gmail SMTP email configuration is working.</p>
        </div>
      `
    });

    if (!result.success) {
      return res.status(500).json({ message: 'Test email failed.', error: result.message });
    }

    res.json({ message: 'Test email sent successfully.', result });
  } catch (error) {
    res.status(500).json({ message: 'Could not send test email.', error: error.message });
  }
});

app.get('/api/doctors/:id/verification-status', auth, async (req, res) => {
  try {
    const profile = await DoctorProfile.findOne({ user: req.params.id })
      .select('isVerified verificationStatus verificationMessage verifiedAt registrationNumber');

    if (!profile) return res.status(404).json({ message: 'Doctor profile not found.' });

    res.json({
      doctorId: req.params.id,
      isVerified: profile.isVerified,
      verificationStatus: profile.verificationStatus,
      verificationMessage: profile.verificationMessage,
      verifiedAt: profile.verifiedAt,
      registrationNumber: profile.registrationNumber
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not load verification status.', error: error.message });
  }
});

app.get('/api/doctors', auth, async (req, res) => {
  try {
    const doctors = await DoctorProfile.find({
      verificationStatus: { $ne: 'rejected' }
    })
      .populate('user', 'name email role')
      .sort({ createdAt: -1 });
    const now = new Date();
    const data = doctors.filter((doctor) => doctor.user).map((doctor) => {
      const value = doctor.toObject();
      delete value.paymentSettings;
      delete value.verificationDocuments;
      value.name = value.user?.name || 'Doctor';
      value.specialization = value.specialization || value.user?.specialty || 'General Medicine';
      value.city = value.city || 'Online';
      value.fee = Number(value.fee || value.user?.consultationFee || 0);
      value.canBook = Boolean(value.isVerified || ['verified', 'Verified'].includes(value.verificationStatus));
      value.availability = getAvailabilityState(doctor, now);
      return value;
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Could not load doctors.', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

async function getSocketUser(socket) {
  const token = socket.handshake.auth?.token;
  if (!token) throw new Error('Missing socket token.');

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-password');
  if (!user) throw new Error('Socket user not found.');
  return user;
}

io.use(async (socket, next) => {
  try {
    socket.user = await getSocketUser(socket);
    next();
  } catch (error) {
    next(new Error('Socket authentication failed.'));
  }
});

io.on('connection', (socket) => {
  if (socket.user.role === 'doctor') {
    socket.join(`doctor-notify:${socket.user._id}`);
  }
  if (socket.user.role === 'patient') {
    socket.join(`patient_${socket.user._id}`);
  }

  socket.on('doctorNotifications', () => {
    if (socket.user.role === 'doctor') {
      socket.join(`doctor-notify:${socket.user._id}`);
    }
  });

  socket.on('patientConnect', async ({ doctorId, type = 'chat', issue = '' }) => {
    if (!doctorId || socket.user.role !== 'patient') return;
    try {
      await createDoctorNotification(app, {
        doctorId,
        patientId: socket.user._id,
        patientName: socket.user.name,
        type: type === 'video' ? 'followup_request' : 'new_chat_request',
        title: type === 'video' ? 'Patient follow-up request' : 'New chat request',
        message: `${socket.user.name || 'A patient'} requested ${type === 'video' ? 'a follow-up call' : 'to chat'}${issue ? ` about ${issue}` : ''}.`,
        relatedChatId: doctorId
      });
    } catch (error) {
      console.error('Could not create doctor chat notification:', error.message);
    }
    io.to(`doctor-notify:${doctorId}`).emit('patientNotification', {
      patientId: socket.user._id,
      patientName: socket.user.name,
      type,
      issue,
      room: doctorId,
      createdAt: new Date()
    });
  });

  socket.on('joinRoom', ({ room }) => {
    if (!room) return;
    socket.join(room);
    socket.emit('roomJoined', { room });
  });

  socket.on('sendMessage', async ({ room, message, receiverId, appointmentId, familyMemberId }) => {
    try {
      if (!room || !message?.trim()) return;

      if (socket.user.role === 'doctor') {
        const profile = await DoctorProfile.findOne({ user: socket.user._id }).select('isVerified verificationStatus');
        if (!profile?.isVerified && !['verified', 'Verified'].includes(profile?.verificationStatus)) {
          socket.emit('receiveMessage', {
            roomId: room,
            text: 'Your verification is pending or rejected. Access is limited.',
            sender: { _id: socket.user._id, name: 'PulseMD - Virtual Clinic', role: 'system' },
            createdAt: new Date()
          });
          return;
        }
      }

      let savedMessage = {
        roomId: room,
        text: message.trim(),
        sender: { _id: socket.user._id, name: socket.user.name, role: socket.user.role },
        createdAt: new Date()
      };

      // Messages can be stored when a known receiver is supplied, while public room chat still works.
      if (receiverId) {
        const chat = await ConsultationChat.findOne({
          roomId: room,
          $or: [
            { patientId: socket.user._id, doctorId: receiverId },
            { doctorId: socket.user._id, patientId: receiverId }
          ]
        }).sort({ updatedAt: -1 });

        if (chat?.status === 'closed') {
          socket.emit('chatStatusUpdated', {
            chatId: chat._id,
            roomId: room,
            status: chat.status,
            closedAt: chat.closedAt,
            message: 'This consultation chat is closed. Doctor must reopen it before new messages can be sent.'
          });
          return;
        }

        const dbMessage = await Message.create({
          roomId: room,
          chatRoomId: room,
          appointmentId: appointmentId || null,
          familyMemberId: familyMemberId || chat?.familyMemberId || null,
          sender: socket.user._id,
          receiver: receiverId,
          text: message.trim()
        });
        savedMessage = await dbMessage.populate([
          { path: 'sender', select: 'name role' },
          { path: 'receiver', select: 'name role' }
        ]);

        if (socket.user.role === 'doctor') {
          try {
            await createPatientNotification(app, {
              patientId: receiverId,
              type: 'doctor_sent_message',
              title: 'New message from doctor',
              message: `${socket.user.name || 'Your doctor'} sent you a message.`,
              relatedChatId: room,
              relatedAppointmentId: appointmentId || null
            });
          } catch (error) {
            console.error('Could not create patient message notification:', error.message);
          }
        } else if (socket.user.role === 'patient') {
          try {
            await createDoctorNotification(app, {
              doctorId: receiverId,
              patientId: socket.user._id,
              patientName: socket.user.name,
              type: 'patient_sent_message',
              title: 'New patient message',
              message: `${socket.user.name || 'A patient'} sent you a message.`,
              relatedChatId: room,
              relatedAppointmentId: appointmentId || null
            });
          } catch (error) {
            console.error('Could not create doctor message notification:', error.message);
          }
        }
      }

      io.to(room).emit('receiveMessage', savedMessage);
    } catch (error) {
      console.error('Socket sendMessage failed:', error.message);
      socket.emit('chatError', { message: 'Could not send message. Please try again.' });
    }
  });

  socket.on('join-chat', ({ doctorId }) => {
    if (!doctorId) return;
    const roomId = `doctor:${doctorId}`;
    socket.join(roomId);
    socket.emit('room-joined', { roomId });
  });

  socket.on('chat-message', async ({ roomId, receiverId, text, appointmentId, familyMemberId }) => {
    try {
      if (!roomId || !receiverId || !text?.trim()) return;

      const chat = await ConsultationChat.findOne({
        roomId,
        $or: [
          { patientId: socket.user._id, doctorId: receiverId },
          { doctorId: socket.user._id, patientId: receiverId }
        ]
      }).sort({ updatedAt: -1 });

      if (chat?.status === 'closed') {
        socket.emit('chatStatusUpdated', {
          chatId: chat._id,
          roomId,
          status: chat.status,
          closedAt: chat.closedAt,
          message: 'This consultation chat is closed. Doctor must reopen it before new messages can be sent.'
        });
        return;
      }

      const message = await Message.create({
        roomId,
        chatRoomId: roomId,
        appointmentId: appointmentId || null,
        familyMemberId: familyMemberId || chat?.familyMemberId || null,
        sender: socket.user._id,
        receiver: receiverId,
        text: text.trim()
      });

      const populated = await message.populate('sender', 'name role');
      io.to(roomId).emit('chat-message', populated);

      if (socket.user.role === 'doctor') {
        try {
          await createPatientNotification(app, {
            patientId: receiverId,
            type: 'doctor_sent_message',
            title: 'New message from doctor',
            message: `${socket.user.name || 'Your doctor'} sent you a message.`,
            relatedChatId: roomId,
            relatedAppointmentId: appointmentId || null
          });
        } catch (error) {
          console.error('Could not create patient chat notification:', error.message);
        }
      } else if (socket.user.role === 'patient') {
        try {
          await createDoctorNotification(app, {
            doctorId: receiverId,
            patientId: socket.user._id,
            patientName: socket.user.name,
            type: 'patient_sent_message',
            title: 'New patient message',
            message: `${socket.user.name || 'A patient'} sent you a message.`,
            relatedChatId: roomId,
            relatedAppointmentId: appointmentId || null
          });
        } catch (error) {
          console.error('Could not create doctor chat notification:', error.message);
        }
      }
    } catch (error) {
      console.error('Socket chat-message failed:', error.message);
      socket.emit('chatError', { message: 'Could not send message. Please try again.' });
    }
  });

  socket.on('join-video', ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.to(roomId).emit('video-user-joined', {
      socketId: socket.id,
      user: { id: socket.user._id, name: socket.user.name, role: socket.user.role }
    });
  });

  socket.on('webrtc-offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('webrtc-offer', { offer, from: socket.id });
  });

  socket.on('webrtc-answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('webrtc-answer', { answer, from: socket.id });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('webrtc-ice-candidate', { candidate, from: socket.id });
  });

  socket.on('offer', ({ room, offer }) => {
    socket.to(room).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ room, answer }) => {
    socket.to(room).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ room, candidate }) => {
    socket.to(room).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        socket.to(roomId).emit('video-user-left', { socketId: socket.id });
      }
    }
  });
});

async function start() {
  const port = process.env.PORT || 5000;

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is not set. Using a development-only fallback secret.');
    process.env.JWT_SECRET = 'development_secret_change_me';
  }

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the old server or run with PORT=${Number(port) + 1}.`);
      process.exit(1);
    }

    console.error('Server failed:', error);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`PulseMD - Virtual Clinic running at http://localhost:${port}`);
  });

  connectDB({ exitOnError: false })
    .then(async () => {
      try {
        await ensureDefaultAdmin();
      } catch (error) {
        console.error('Default admin setup failed:', error.message);
      }
    })
    .catch((error) => {
    console.error('MongoDB background connection failed:', error.message);
    });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
