const authService = require('../services/authService');
const strings = require('../resources/strings');

// POST /api/auth/register (REQ-1)
async function register(req, res) {
  const user = await authService.registerUser(req.body);
  res.status(201).json({ message: strings.auth.registered, user: user.toJSON() });
}

module.exports = { register };
