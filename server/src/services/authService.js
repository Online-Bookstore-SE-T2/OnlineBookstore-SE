const bcrypt = require('bcrypt');
const User = require('../models/User');
const { config } = require('../config/env');
const { ACCOUNT_STATUS } = require('../constants');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');
const { FieldValidator, LIMITS } = require('../validation/validators');
const tokenService = require('./tokenService');

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

function invalidCredentials() {
  return new AppError(401, strings.auth.invalidCredentials);
}

function lockedError() {
  return new AppError(423, strings.auth.locked);
}

// Hash compared against when the e-mail is unknown, so response time does not reveal
// whether an account exists.
let dummyHashPromise;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('no-such-account', config.bcryptRounds);
  return dummyHashPromise;
}

function isLocked(lockUntil, now = Date.now()) {
  return Boolean(lockUntil) && lockUntil.getTime() > now;
}

// REQ-2: the failure that brings the consecutive count to five locks the account for 15 minutes.
function shouldLock(failedAttempts) {
  return failedAttempts >= config.lockout.maxAttempts;
}

async function recordFailedAttempt(userId) {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { failedLoginAttempts: 1 } },
    { new: true },
  ).select('+failedLoginAttempts');
  if (!shouldLock(updated.failedLoginAttempts)) return false;
  // The counter restarts so that, after the lock ends, five new failures are needed to lock again.
  await User.updateOne(
    { _id: userId },
    { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + config.lockout.durationMs) } },
  );
  return true;
}

// REQ-2 (FR02): authenticate a registered user and issue a 24-hour JWT.
async function loginUser(body = {}) {
  const v = new FieldValidator();
  const email = v.email('email', body.email);
  const password = v.password('password', body.password);
  v.throwIfInvalid();

  const user = await User.findOne({ email }).select('+passwordHash +failedLoginAttempts +lockUntil');
  if (!user || user.status === ACCOUNT_STATUS.DELETED) {
    await bcrypt.compare(password, await dummyHash());
    throw invalidCredentials();
  }
  if (isLocked(user.lockUntil)) throw lockedError();

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const nowLocked = await recordFailedAttempt(user._id);
    throw nowLocked ? lockedError() : invalidCredentials();
  }

  // A successful login restarts the consecutive-failure count.
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
  }
  const { token, expiresAt } = tokenService.issueToken(user);
  return { user, token, expiresAt };
}

module.exports = {
  registerUser,
  loginUser,
  hashPassword,
  emailTakenError,
  isDuplicateEmail,
  isLocked,
  shouldLock,
};
