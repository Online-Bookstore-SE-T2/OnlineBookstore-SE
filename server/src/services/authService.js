const bcrypt = require('bcrypt');
const User = require('../models/User');
const { config } = require('../config/env');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');
const { FieldValidator, LIMITS } = require('../validation/validators');

function emailTakenError() {
  return new AppError(409, strings.auth.emailTaken, { email: strings.auth.emailTaken });
}

function isDuplicateEmail(err) {
  return Boolean(err && err.code === 11000 && (err.keyPattern?.email || err.keyValue?.email !== undefined));
}

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

// REQ-1 (FR01): register a visitor with name, e-mail address and password.
// Phone number and one delivery address are optional (Appendix B). Only whitelisted fields
// are read, so a client can never choose its role, ID, status or registration date.
async function registerUser(body = {}) {
  const v = new FieldValidator();
  const name = v.text('name', body.name, { label: strings.labels.name, required: true, max: LIMITS.name });
  const email = v.email('email', body.email);
  const password = v.password('password', body.password);
  const phone = v.phone('phone', body.phone);
  const address = v.address(body.address, { prefix: 'address.', required: false });
  v.throwIfInvalid();

  if (await User.exists({ email })) throw emailTakenError();

  const passwordHash = await hashPassword(password);
  try {
    return await User.create({
      name,
      email,
      passwordHash,
      ...(phone && { phone }),
      addresses: address ? [{ ...address, isDefault: true }] : [],
    });
  } catch (err) {
    // Two simultaneous registrations: the unique index lets only one through.
    if (isDuplicateEmail(err)) throw emailTakenError();
    throw err;
  }
}

module.exports = { registerUser, hashPassword, emailTakenError, isDuplicateEmail };
