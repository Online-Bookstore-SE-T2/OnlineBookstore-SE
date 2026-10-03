const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins/toJSON');

// SRS 6.2: every administrative action is written to an immutable audit log recording
// actor, action, target and timestamp. Entries can be created and read, never changed.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    action: { type: String, required: true, immutable: true },
    targetType: { type: String, required: true, immutable: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    // Snapshot of a readable name for the target, kept even if the target is later purged.
    targetLabel: { type: String, immutable: true },
    details: { type: mongoose.Schema.Types.Mixed, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

const IMMUTABLE_MESSAGE = 'Audit log entries cannot be changed or deleted.';
const WRITE_QUERIES = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

auditLogSchema.pre(WRITE_QUERIES, { query: true, document: false }, function rejectQueryWrite() {
  throw new Error(IMMUTABLE_MESSAGE);
});
auditLogSchema.pre('deleteOne', { query: false, document: true }, function rejectDocumentDelete() {
  throw new Error(IMMUTABLE_MESSAGE);
});
auditLogSchema.pre('save', function rejectResave() {
  if (!this.isNew) throw new Error(IMMUTABLE_MESSAGE);
});
auditLogSchema.pre('insertMany', function rejectBulk() {
  throw new Error(IMMUTABLE_MESSAGE);
});

auditLogSchema.plugin(toJSONPlugin);

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
