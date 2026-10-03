const AuditLog = require('../models/AuditLog');

const PAGE_SIZE = 20;

// SRS 6.2: records who did what to which record, and when (createdAt).
function record(actor, action, target, details) {
  return AuditLog.create({
    actor: actor._id,
    action,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    ...(details && { details }),
  });
}

async function list({ page = 1 } = {}) {
  const [items, total] = await Promise.all([
    AuditLog.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .populate('actor', 'name'),
    AuditLog.countDocuments(),
  ]);
  return { items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

module.exports = { record, list };
