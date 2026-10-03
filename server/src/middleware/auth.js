const mongoose = require('mongoose');
const User = require('../models/User');
const { ACCOUNT_STATUS, ROLES } = require('../constants');
const strings = require('../resources/strings');
const { AppError } = require('../utils/errors');
const { asyncHandler } = require('../utils/asyncHandler');
const tokenService = require('../services/tokenService');

// Resolves the bearer token to a live user. The user is re-read on every request so that
// role changes, suspension and deletion take effect immediately.
async function resolveSession(req) {
  const token = tokenService.extractBearerToken(req.headers.authorization);
  if (!token) throw new AppError(401, strings.auth.loginRequired);
  const payload = await tokenService.verifyToken(token);
  if (!mongoose.isValidObjectId(payload.sub)) throw tokenService.sessionError();
  const user = await User.findById(payload.sub);
  if (!user || user.status === ACCOUNT_STATUS.DELETED) throw tokenService.sessionError();
  req.user = user;
  req.auth = payload;
}

// Requires a valid session; responds 401 otherwise.
const authenticate = asyncHandler(async (req, _res, next) => {
  await resolveSession(req);
  next();
});

// Role-based access control (SRS 6.3): responds 403 unless the user holds one of the roles.
function requireRole(...roles) {
  return (req, _res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return next(new AppError(403, strings.auth.forbidden));
  };
}

// REQ-4: administration routes answer HTTP 403 to every non-administrator request,
// including requests with a missing, expired or invalid token.
const requireAdministrator = asyncHandler(async (req, _res, next) => {
  try {
    await resolveSession(req);
  } catch {
    throw new AppError(403, strings.auth.forbidden);
  }
  if (req.user.role !== ROLES.ADMINISTRATOR) throw new AppError(403, strings.auth.forbidden);
  next();
});

// A suspended account is read-only: it can browse but every change is refused.
function requireWriteAccess(req, _res, next) {
  if (req.user && req.user.status === ACCOUNT_STATUS.SUSPENDED) {
    return next(new AppError(403, strings.auth.suspended));
  }
  return next();
}

module.exports = { authenticate, requireRole, requireAdministrator, requireWriteAccess, resolveSession };
