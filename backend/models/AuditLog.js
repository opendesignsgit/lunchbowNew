const mongoose = require("mongoose");

/** Who changed what from the admin dashboard (see lib/audit.js). */
const AuditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    action: { type: String, required: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);

AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
