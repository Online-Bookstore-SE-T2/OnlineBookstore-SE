const authService = require('../services/authService');
const tokenService = require('../services/tokenService');
const strings = require('../resources/strings');

// POST /api/auth/register (REQ-1)
async function register(req, res) {
  const user = await authService.registerUser(req.body);
  res.status(201).json({ message: strings.auth.registered, user: user.toJSON() });
}

// POST /api/auth/login (REQ-2)
async function login(req, res) {
  const { user, token, expiresAt } = await authService.loginUser(req.body);
  res.json({ token, expiresAt, user: user.toJSON() });
}

// POST /api/auth/logout (REQ-2)
async function logout(req, res) {
  await tokenService.revokeToken(req.auth);
  res.json({ message: strings.auth.loggedOut });
}

// GET /api/auth/session: the user behind the current token, used to restore a session.
async function session(req, res) {
  res.json({ user: req.user.toJSON() });
}

module.exports = { register, login, logout, session };
