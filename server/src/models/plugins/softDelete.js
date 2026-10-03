const { config } = require('../../config/env');

// SRS 6.2: deletion is a reversible soft delete retained for 30 days. `deletedAt` marks the
// record inactive; MongoDB's TTL monitor removes it permanently 30 days later. Records with
// `deletedAt: null` are live and are never touched by the TTL index.
//
// Every query that serves live data must filter on `deletedAt: null` (see `live()`).
function softDeletePlugin(schema) {
  schema.add({ deletedAt: { type: Date, default: null } });
  schema.index({ deletedAt: 1 }, { expireAfterSeconds: config.softDeleteRetentionSeconds });

  schema.statics.live = function live(filter = {}) {
    return this.find({ ...filter, deletedAt: null });
  };
}

function isWithinRetention(deletedAt, now = Date.now()) {
  return Boolean(deletedAt) && now - deletedAt.getTime() < config.softDeleteRetentionSeconds * 1000;
}

module.exports = { softDeletePlugin, isWithinRetention };
