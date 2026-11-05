const Subscription = require("../../models/subscriptionModel");
const Form = require("../../models/Form");
const ReminderLog = require("../../models/ReminderLog");
const { toDateKey, todayKeyIST, addDaysKey } = require("../../lib/pricing");
const { subscriptionView, parentName, fail } = require("./helpers");

const daysBetween = (fromKey, toKey) =>
  Math.round((new Date(`${toKey}T00:00:00Z`) - new Date(`${fromKey}T00:00:00Z`)) / 86400000);

/**
 * Active subscriptions ending within `days` days whose user has no upcoming or
 * pending plan. Shared with jobs/renewalReminder.js.
 */
const findExpiringSubscriptions = async ({ days, exactDay } = {}) => {
  const today = todayKeyIST();
  const fromKey = exactDay != null ? addDaysKey(today, exactDay) : today;
  const toKey = exactDay != null ? fromKey : addDaysKey(today, Number(days) || 10);
  // Wide DB window (±1 day) then exact IST calendar-day filter.
  const subs = await Subscription.find({
    status: "active",
    endDate: { $gte: new Date(`${addDaysKey(fromKey, -1)}T00:00:00Z`), $lte: new Date(`${addDaysKey(toKey, 1)}T23:59:59Z`) },
  })
    .populate("children")
    .lean();
  const inRange = subs.filter((s) => {
    const k = toDateKey(s.endDate);
    return k && k >= fromKey && k <= toKey;
  });
  if (inRange.length === 0) return [];
  const userIds = Array.from(new Set(inRange.map((s) => String(s.user))));
  const withNext = new Set(
    (await Subscription.find({ user: { $in: userIds }, status: { $in: ["upcoming", "pending_payment"] } }).select("user").lean()).map((s) =>
      String(s.user)
    )
  );
  const candidates = inRange.filter((s) => !withNext.has(String(s.user)));
  const forms = await Form.find({ user: { $in: candidates.map((s) => s.user) } }).select("user parentDetails wallet.points").lean();
  const formBy = new Map(forms.map((f) => [String(f.user), f]));
  const logs = await ReminderLog.find({ subscriptionId: { $in: candidates.map((s) => s._id) }, kind: "renewal" }).lean();
  const logsBy = new Map();
  for (const l of logs) {
    const k = String(l.subscriptionId);
    if (!logsBy.has(k)) logsBy.set(k, []);
    logsBy.get(k).push(l);
  }
  return candidates
    .map((s) => {
      const form = formBy.get(String(s.user));
      const p = (form && form.parentDetails) || {};
      return {
        ...subscriptionView(s),
        daysLeft: daysBetween(today, toDateKey(s.endDate)),
        parent: { name: parentName(form), phone: p.mobile || "", email: p.email || "" },
        walletPoints: form && form.wallet ? form.wallet.points || 0 : 0,
        remindersSent: (logsBy.get(String(s._id)) || []).map((l) => ({ daysBefore: l.daysBefore, channel: l.channel, sentAt: l.sentAt })),
        form,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
};

/** GET /renewals?days=10 */
const listRenewals = async (req, res) => {
  try {
    const days = Math.min(90, Math.max(0, parseInt(req.query.days, 10) || 10));
    const rows = await findExpiringSubscriptions({ days });
    return res.json({ success: true, data: rows.map(({ form, ...r }) => r), days, today: todayKeyIST() });
  } catch (err) {
    console.error("adminOps.listRenewals:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { listRenewals, findExpiringSubscriptions, daysBetween };
