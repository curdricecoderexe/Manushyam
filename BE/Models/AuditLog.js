const mongoose = require("mongoose");

// One entry per staff/admin write: who, what, which record, the changed fields (before → after) and from where.
// Entries are append-only; nothing in the API updates or deletes them.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorEmail: String,
    actorRole: { type: String, enum: ["staff", "admin"] },
    // "<resource>.<verb>", e.g. "coupon.update", "user.role", "order.status".
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    summary: { type: String, maxlength: 300 },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    method: String,
    path: String,
    status: Number,
    ip: String,
    userAgent: { type: String, maxlength: 300 },
    requestId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

auditLogSchema.methods.toAdmin = function toAdmin() {
  const { _id, __v, actor, ...rest } = this.toObject();
  return { id: String(_id), actor: String(actor), ...rest };
};

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

module.exports = { AuditLog };
