const mongoose = require('mongoose');

const doctorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    specialization: {
      type: String,
      required: true,
      trim: true
    },
    bio: {
      type: String,
      trim: true,
      default: ''
    },
    experienceYears: {
      type: Number,
      min: 0,
      default: 0
    },
    fee: {
      type: Number,
      min: 0,
      default: 0
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    clinic: {
      type: String,
      trim: true,
      default: ''
    },
    degreeName: {
      type: String,
      trim: true,
      default: ''
    },
    registrationNumber: {
      type: String,
      trim: true,
      default: ''
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'pending_review', 'rejected'],
      default: 'pending_review',
      index: true
    },
    verificationMessage: {
      type: String,
      trim: true,
      default: 'Verification pending review'
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    verificationChecks: {
      nameMatched: { type: Boolean, default: false },
      degreeMatched: { type: Boolean, default: false },
      registrationMatched: { type: Boolean, default: false },
      readableDocuments: { type: Boolean, default: false }
    },
    verificationReviewedAt: {
      type: Date,
      default: null
    },
    verificationDocuments: {
      degreeCertificate: {
        fileName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        extractedText: { type: String, default: '' }
      },
      medicalRegistrationCertificate: {
        fileName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        extractedText: { type: String, default: '' }
      },
      idProof: {
        fileName: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        extractedText: { type: String, default: '' }
      }
    },
    profileImage: {
      type: String,
      trim: true,
      default: ''
    },
    availabilityStatus: {
      type: String,
      enum: ['available', 'busy', 'offline'],
      default: 'available'
    },
    availabilitySchedule: {
      timezone: {
        type: String,
        default: 'Asia/Kolkata'
      },
      days: [
        {
          type: String,
          enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        }
      ],
      slots: [
        {
          startTime: {
            type: String,
            trim: true,
            default: ''
          },
          endTime: {
            type: String,
            trim: true,
            default: ''
          }
        }
      ]
    },
    paymentSettings: {
      upiId: {
        type: String,
        trim: true,
        default: ''
      },
      bankAccountHolderName: {
        type: String,
        trim: true,
        default: ''
      },
      bankAccountNumber: {
        type: String,
        trim: true,
        default: ''
      },
      ifscCode: {
        type: String,
        trim: true,
        default: ''
      },
      paymentQrCode: {
        type: String,
        trim: true,
        default: ''
      },
      updatedAt: {
        type: Date,
        default: null
      }
    }
  },
  { timestamps: true }
);

doctorProfileSchema.pre('validate', function ensureDefaultSchedule(next) {
  if (!this.availabilitySchedule) {
    this.availabilitySchedule = {};
  }

  if (!Array.isArray(this.availabilitySchedule.days) || !this.availabilitySchedule.days.length) {
    this.availabilitySchedule.days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  }

  if (!Array.isArray(this.availabilitySchedule.slots) || !this.availabilitySchedule.slots.length) {
    this.availabilitySchedule.slots = [
      { startTime: '10:00', endTime: '13:00' },
      { startTime: '17:00', endTime: '20:00' }
    ];
  }

  if (!this.availabilitySchedule.timezone) {
    this.availabilitySchedule.timezone = 'Asia/Kolkata';
  }

  next();
});

module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
