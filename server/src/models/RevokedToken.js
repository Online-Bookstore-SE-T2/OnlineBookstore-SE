const mongoose = require('mongoose');

// Tokens invalidated by log-out (REQ-2). Each entry is removed by MongoDB once the token
// would have expired anyway, so the collection stays small.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.RevokedToken || mongoose.model('RevokedToken', revokedTokenSchema);
