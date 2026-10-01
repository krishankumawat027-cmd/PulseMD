const ConsultationChat = require('../models/ConsultationChat');
const Message = require('../models/Message');

function roomForDoctor(doctorId) {
  return String(doctorId);
}

async function findConsultationChat({ roomId, userId, role, patientId = null }) {
  const query = { roomId };
  if (role === 'doctor') {
    query.doctorId = userId;
    if (patientId) query.patientId = patientId;
  } else if (role === 'patient') {
    query.patientId = userId;
  }
  return ConsultationChat.findOne(query)
    .populate('patientId', 'name email phone')
    .populate('doctorId', 'name email phone')
    .populate('familyMemberId', 'fullName relation age gender bloodGroup quickHealthStatus')
    .populate('requestId')
    .populate('prescriptionId')
    .sort({ updatedAt: -1 });
}

async function ensureConsultationChat(data) {
  const patientId = data.patientId?._id || data.patientId;
  const doctorId = data.doctorId?._id || data.doctorId;
  const roomId = data.roomId || roomForDoctor(doctorId);
  const aiSummary = String(data.aiSummary || '').trim();
  const familyMemberId = data.familyMemberId?._id || data.familyMemberId || null;

  let chat = data.requestId
    ? await ConsultationChat.findOne({ requestId: data.requestId })
    : null;

  if (!chat && (!data.requestId || data.appointmentId)) {
    chat = await ConsultationChat.findOne({
      patientId,
      doctorId,
      appointmentId: data.appointmentId || null
    });
  }

  if (!chat) {
    chat = await ConsultationChat.create({
      patientId,
      doctorId,
      requestId: data.requestId || null,
      familyMemberId,
      appointmentId: data.appointmentId || null,
      roomId,
      status: data.status || 'open',
      aiSummary
    });
  } else {
    if (data.requestId && !chat.requestId) chat.requestId = data.requestId;
    if (familyMemberId && !chat.familyMemberId) chat.familyMemberId = familyMemberId;
    if (data.appointmentId && !chat.appointmentId) chat.appointmentId = data.appointmentId;
    if (aiSummary && chat.aiSummary !== aiSummary) chat.aiSummary = aiSummary;
    if (data.status) chat.status = data.status;
    await chat.save();
  }

  console.info('Consultation chat ensured:', {
    chatId: chat._id.toString(),
    roomId: chat.roomId,
    doctorId: doctorId?.toString?.() || String(doctorId),
    patientId: patientId?.toString?.() || String(patientId),
    familyMemberId: (familyMemberId || chat.familyMemberId || '')?.toString?.() || '',
    requestId: (data.requestId || chat.requestId || '')?.toString?.() || String(data.requestId || chat.requestId || ''),
    hasAiSummary: Boolean(chat.aiSummary)
  });

  return chat;
}

async function createChatSystemMessage({ roomId, senderId, receiverId, appointmentId = null, familyMemberId = null, text }) {
  const message = await Message.create({
    roomId,
    chatRoomId: roomId,
    appointmentId,
    familyMemberId,
    sender: senderId,
    receiver: receiverId,
    text,
    type: 'system'
  });

  return message.populate([
    { path: 'sender', select: 'name role' },
    { path: 'receiver', select: 'name role' }
  ]);
}

async function emitChatStatus(app, chat, message = null) {
  const io = app?.get?.('io');
  if (!io) return;
  io.to(chat.roomId).emit('chatStatusUpdated', {
    chatId: chat._id,
    roomId: chat.roomId,
    status: chat.status,
    aiSummary: chat.aiSummary || '',
    prescriptionId: chat.prescriptionId,
    prescriptionSent: Boolean(chat.prescriptionSent || chat.prescriptionId || chat.status === 'prescription_sent'),
    closedAt: chat.closedAt,
    reopenedAt: chat.reopenedAt,
    updatedAt: chat.updatedAt
  });
  if (message) io.to(chat.roomId).emit('receiveMessage', message);
}

module.exports = {
  roomForDoctor,
  findConsultationChat,
  ensureConsultationChat,
  createChatSystemMessage,
  emitChatStatus
};
