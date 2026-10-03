const userService = require('../services/userService');
const strings = require('../resources/strings');

// GET /api/users/me (REQ-3)
async function getProfile(req, res) {
  res.json({ user: req.user.toJSON() });
}

// PATCH /api/users/me (REQ-3)
async function updateProfile(req, res) {
  const user = await userService.updateProfile(req.user, req.body);
  res.json({ message: strings.profile.updated, user: user.toJSON() });
}

// PUT /api/users/me/password (REQ-3)
async function changePassword(req, res) {
  await userService.changePassword(req.user, req.body);
  res.json({ message: strings.profile.passwordChanged });
}

// GET /api/users/me/addresses (REQ-3)
async function listAddresses(req, res) {
  res.json({ addresses: req.user.toJSON().addresses });
}

// POST /api/users/me/addresses (REQ-3)
async function addAddress(req, res) {
  await userService.addAddress(req.user, req.body);
  res.status(201).json({ message: strings.profile.addressAdded, addresses: req.user.toJSON().addresses });
}

// PUT /api/users/me/addresses/:addressId (REQ-3)
async function updateAddress(req, res) {
  await userService.updateAddress(req.user, req.params.addressId, req.body);
  res.json({ message: strings.profile.addressUpdated, addresses: req.user.toJSON().addresses });
}

// DELETE /api/users/me/addresses/:addressId (REQ-3)
async function deleteAddress(req, res) {
  await userService.deleteAddress(req.user, req.params.addressId);
  res.json({ message: strings.profile.addressDeleted, addresses: req.user.toJSON().addresses });
}

// PATCH /api/users/me/addresses/:addressId/default (REQ-3)
async function setDefaultAddress(req, res) {
  await userService.setDefaultAddress(req.user, req.params.addressId);
  res.json({ message: strings.profile.defaultChanged, addresses: req.user.toJSON().addresses });
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
