const mongoose = require("mongoose");
const { toDateKey } = require("../../lib/pricing");

const isValidId = (v) =>
  mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === String(v);

const parsePage = (query, defaultLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" (or anything toDateKey understands) → Date at UTC midnight of that calendar day. */
const dateKeyToDate = (value) => {
  const key = toDateKey(value);
  if (!key || !DATE_KEY_RE.test(key)) return null;
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Subscription document → plain object with "YYYY-MM-DD" keys next to the raw dates. */
const subscriptionView = (sub) => {
  if (!sub) return null;
  const s = typeof sub.toObject === "function" ? sub.toObject() : { ...sub };
  s.startDateKey = toDateKey(s.startDate);
  s.endDateKey = toDateKey(s.endDate);
  return s;
};

const parentName = (form) => {
  const p = form && form.parentDetails;
  if (!p) return "";
  return [p.fatherFirstName, p.fatherLastName].filter(Boolean).join(" ").trim();
};

const childName = (child) =>
  child ? [child.childFirstName, child.childLastName].filter(Boolean).join(" ").trim() : "";

const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...(extra || {}) });

module.exports = {
  isValidId,
  parsePage,
  escapeRegex,
  DATE_KEY_RE,
  dateKeyToDate,
  subscriptionView,
  parentName,
  childName,
  fail,
};
