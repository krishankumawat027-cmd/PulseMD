const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    role: {
      type: String,
      enum: ['patient', 'doctor', 'admin'],
      required: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    specialty: {
      type: String,
      trim: true,
      default: ''
    },
    selectedLanguage: {
      type: String,
      enum: ['en', 'hi'],
      default: 'en'
    },
    preferredLanguage: {
      type: String,
      enum: ['en', 'hi'],
      default: 'en'
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    passwordResetToken: {
      type: String,
      select: false,
      default: ''
    },
    passwordResetExpires: {
      type: Date,
      select: false,
      default: null
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);
