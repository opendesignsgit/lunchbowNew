/**
 * recordAudit(req, { action, targetType, targetId, before, after, reason })
 * Writes an AuditLog row for an admin mutation. Never throws.
 */
const AuditLog = require("../models/AuditLog");

const clientIp = (req) => {
  const fwd = req && req.headers && req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req && (req.ip || (req.connection && req.connection.remoteAddress))) || "";
};

const plain = (v) => {
  if (v == null) return v;
  if (typeof v.toObject === "function") return v.toObject();
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (err) {
    return String(v);
  }
};

const recordAudit = async (req, { action, targetType, targetId, before, after, reason }) => {
  try {
    return await AuditLog.create({
      adminId: req && req.user && req.user._id ? req.user._id : undefined,
      action,
      targetType: targetType || "",
      targetId: targetId != null ? String(targetId) : "",
      before: plain(before),
      after: plain(after),
      reason: reason || "",
      ip: clientIp(req),
    });
  } catch (err) {
    console.error("[audit] failed to record", action, err && err.message);
    return null;
  }
};

module.exports = { recordAudit, clientIp };
