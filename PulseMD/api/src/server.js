const path = require('path');
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const { User } = require('./models');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET', 'POST'] } });

app.set('io', io);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'PulseMD - Virtual Clinic API' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/emergency', require('./routes/emergency'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/ai', require('./routes/ai'));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('Missing token');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    socket.user = await User.findById(decoded.id).select('-password');
    if (!socket.user) throw new Error('User not found');
    next();
  } catch (error) {
    next(new Error('Socket auth failed'));
  }
});

io.on('connection', (socket) => {
  socket.join(String(socket.user._id));
  socket.on('chat:join', (room) => socket.join(room));
  socket.on('disconnect', () => {});
});

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Server error.' });
});

async function start() {
  await connectDB();
  const port = process.env.PORT || 7000;
  server.listen(port, () => console.log(`PulseMD API running on http://localhost:${port}`));
}

start().catch((error) => {
  console.error('API failed to start:', error);
  process.exit(1);
});
