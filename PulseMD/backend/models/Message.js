const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true
    },
    chatRoomId: {
      type: String,
      index: true,
      default: ''
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FamilyMember',
      default: null,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['patient', 'doctor', 'admin', 'system', ''],
      default: '',
      index: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      default: '',
      trim: true
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'pdf', 'video', 'file', 'audio'],
      default: 'text',
      index: true
    },
    fileUrl: {
      type: String,
      trim: true,
      default: ''
    },
    fileName: {
      type: String,
      trim: true,
      default: ''
    },
    fileMimeType: {
      type: String,
      trim: true,
      default: ''
    },
    fileSize: {
      type: Number,
      default: 0
    },
    audioUrl: {
      type: String,
      trim: true,
      default: ''
    },
    duration: {
      type: Number,
      min: 0,
      default: 0
    },
    type: {
      type: String,
      enum: ['user', 'system'],
      default: 'user',
      index: true
    },
    read: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

messageSchema.virtual('senderId').get(function senderId() {
  return this.sender;
});

messageSchema.virtual('receiverId').get(function receiverId() {
  return this.receiver;
});

messageSchema.virtual('chatId').get(function chatId() {
  return this.chatRoomId || this.roomId;
});

messageSchema.virtual('seen').get(function seen() {
  return this.read;
});

messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);
