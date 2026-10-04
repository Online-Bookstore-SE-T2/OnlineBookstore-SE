const mongoose = require('mongoose');
const { ROLES, ACCOUNT_STATUS, REJECT_REASON_CODES, SELLER_REQUEST_STATUS } = require('../constants');
const { LIMITS, EMAIL_PATTERN, PHONE_PATTERN, POSTAL_CODE_PATTERN } = require('../validation/validators');
const { config } = require('../config/env');
const { toJSONPlugin } = require('./plugins/toJSON');
const { softDeletePlugin } = require('./plugins/softDelete');

// One delivery address (REQ-3). Postal code is a 6-digit numeric code (Appendix B).
const addressSchema = new mongoose.Schema(
  {
    line: { type: String, required: true, trim: true, maxlength: LIMITS.addressLine },
    city: { type: String, required: true, trim: true, maxlength: LIMITS.city },
    state: { type: String, required: true, trim: true, maxlength: LIMITS.state },
    postalCode: { type: String, required: true, match: POSTAL_CODE_PATTERN },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
addressSchema.plugin(toJSONPlugin);

// Field layout follows SRS Appendix B ("information required to register the customer").
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: LIMITS.name },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: LIMITS.email,
      match: EMAIL_PATTERN,
      unique: true,
    },
    // Bcrypt hash only; the plaintext password is never stored (SRS 2.5, 6.3).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.BUYER, required: true },
    phone: { type: String, match: PHONE_PATTERN },
    addresses: {
      type: [addressSchema],
      validate: {
        validator: (addresses) => addresses.length <= config.maxAddresses,
        message: `At most ${config.maxAddresses} delivery addresses are allowed.`,
      },
    },
    registrationDate: { type: Date, default: Date.now, immutable: true, required: true },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      required: true,
    },
    rejectReasonCode: { type: String, enum: REJECT_REASON_CODES, maxlength: 4 },
    // A Buyer's request to become a Seller, decided by an administrator.
    sellerRequest: {
      status: {
        type: String,
        enum: Object.values(SELLER_REQUEST_STATUS),
        default: SELLER_REQUEST_STATUS.NONE,
      },
      note: { type: String, trim: true, maxlength: LIMITS.sellerRequestNote },
      requestedAt: Date,
      decidedAt: Date,
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    // Status to return to when a soft-deleted account is restored.
    statusBeforeDelete: { type: String, enum: [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.SUSPENDED], select: false },
    // REQ-2 lockout state: consecutive failed logins and the time the lock ends.
    failedLoginAttempts: { type: Number, default: 0, min: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  // Optimistic concurrency: two simultaneous saves of the same user cannot both succeed,
  // so the five-address limit cannot be exceeded by parallel requests.
  { timestamps: true, optimisticConcurrency: true },
);

userSchema.plugin(softDeletePlugin);
userSchema.plugin(toJSONPlugin, { hide: ['passwordHash', 'failedLoginAttempts', 'lockUntil', 'statusBeforeDelete'] });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
