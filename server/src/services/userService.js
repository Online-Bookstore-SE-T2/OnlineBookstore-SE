const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');
const { config } = require('../config/env');
const { ROLES, SELLER_REQUEST_STATUS } = require('../constants');
const strings = require('../resources/strings');
const { AppError, ValidationError } = require('../utils/errors');
const { FieldValidator, LIMITS } = require('../validation/validators');
const { hashPassword, emailTakenError, isDuplicateEmail } = require('./authService');

// All functions act on the authenticated user's own document (`user`), so one user can never
// read or change another user's personal data through these routes (NFR10).

// REQ-3: update name, e-mail address and phone number. Absent fields are left unchanged;
// an empty phone number removes it.
async function updateProfile(user, body = {}) {
  const v = new FieldValidator();
  const name = v.text('name', body.name, { label: strings.labels.name, required: body.name !== undefined, max: LIMITS.name });
  const email = body.email === undefined ? undefined : v.email('email', body.email);
  const phone = v.phone('phone', body.phone);
  v.throwIfInvalid();

  if (email !== undefined && email !== user.email) {
    // Server-built operator, so it is marked trusted for the global filter sanitiser.
    if (await User.exists({ email, _id: mongoose.trusted({ $ne: user._id }) })) throw emailTakenError();
    user.email = email;
  }
  if (name !== undefined) user.name = name;
  if (phone === '') user.phone = undefined;
  else if (phone !== undefined) user.phone = phone;

  try {
    return await user.save();
  } catch (err) {
    if (isDuplicateEmail(err)) throw emailTakenError();
    throw err;
  }
}

// REQ-3: change password after confirming the current one.
async function changePassword(user, body = {}) {
  const v = new FieldValidator();
  const currentPassword = v.password('currentPassword', body.currentPassword, { label: strings.labels.currentPassword });
  const newPassword = v.password('newPassword', body.newPassword, { label: strings.labels.newPassword });
  v.throwIfInvalid();

  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, withHash.passwordHash))) {
    throw new ValidationError({ currentPassword: strings.profile.currentPasswordWrong }, strings.profile.currentPasswordWrong);
  }
  withHash.passwordHash = await hashPassword(newPassword);
  await withHash.save();
}

function findAddress(user, addressId) {
  const address = mongoose.isValidObjectId(addressId) ? user.addresses.id(addressId) : null;
  if (!address) throw new AppError(404, strings.profile.addressNotFound);
  return address;
}

function makeDefault(user, address) {
  user.addresses.forEach((entry) => {
    entry.isDefault = entry._id.equals(address._id);
  });
}

function validateAddressBody(body) {
  const v = new FieldValidator();
  const address = v.address(body, { required: true });
  v.throwIfInvalid();
  return address;
}

// REQ-3: add a delivery address, at most five. The first address becomes the default.
async function addAddress(user, body = {}) {
  const fields = validateAddressBody(body);
  if (user.addresses.length >= config.maxAddresses) throw new AppError(409, strings.profile.addressLimit);

  user.addresses.push(fields);
  const added = user.addresses[user.addresses.length - 1];
  if (user.addresses.length === 1 || body.isDefault === true) makeDefault(user, added);
  await user.save();
  return added;
}

async function updateAddress(user, addressId, body = {}) {
  const address = findAddress(user, addressId);
  address.set(validateAddressBody(body));
  if (body.isDefault === true) makeDefault(user, address);
  await user.save();
  return address;
}

// Deleting the default address passes the default to the first remaining address.
async function deleteAddress(user, addressId) {
  const address = findAddress(user, addressId);
  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length > 0) makeDefault(user, user.addresses[0]);
  await user.save();
}

async function setDefaultAddress(user, addressId) {
  makeDefault(user, findAddress(user, addressId));
  await user.save();
}

// A Buyer asks to become a Seller, with an optional note of up to 200 characters.
// An administrator approves or rejects the request (REQ-4).
async function requestSellerStatus(user, body = {}) {
  if (user.role !== ROLES.BUYER) throw new AppError(409, strings.sellerRequest.alreadySeller);
  if (user.sellerRequest?.status === SELLER_REQUEST_STATUS.PENDING) throw new AppError(409, strings.sellerRequest.alreadyPending);
  const v = new FieldValidator();
  const note = v.text('note', body.note, { label: strings.labels.note, max: LIMITS.sellerRequestNote });
  v.throwIfInvalid();

  user.sellerRequest = { status: SELLER_REQUEST_STATUS.PENDING, note: note || undefined, requestedAt: new Date() };
  return user.save();
}

module.exports = {
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  requestSellerStatus,
};
