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

/** Mongoose Mixed values may not contain keys with "." or a leading "$" — rewrite them. */
const safeKeys = (v) => {
  if (Array.isArray(v)) return v.map(safeKeys);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[String(k).replace(/\./g, "_").replace(/^\$/, "_")] = safeKeys(val);
    }
    return out;
  }
  return v;
};

const plain = (v) => {
  if (v == null) return v;
  const obj = typeof v.toObject === "function" ? v.toObject() : v;
  try {
    return safeKeys(JSON.parse(JSON.stringify(obj)));
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

module.exports = { recordAudit, clientIp, safeKeys, plain };
