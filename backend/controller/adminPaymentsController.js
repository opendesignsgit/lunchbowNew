/**
 * Admin payment tools (mounted at /api/admin-ops/payments, admin login required).
 *
 * Replaces the one-off repair scripts: every payment intent is listed with its
 * reconciliation state, and an admin can ask CCAvenue for the status, confirm a
 * payment they verified in the CCAvenue dashboard, or re-run the business effect of a
 * paid order that failed to apply.
 */
const mongoose = require("mongoose");
const PaymentIntent = require("../models/PaymentIntent");
const UserPayment = require("../models/Payment");
const Customer = require("../models/Customer");
const HolidayPayment = require("../models/HolidayPayment");
const { settleOrder, retryApply } = require("../lib/payments/settlement");
const { reconcileOrder, runReconcilePayments } = require("../jobs/reconcilePayments");
const { isEnabled: statusApiEnabled } = require("../lib/ccavenueStatus");

let recordAudit = async () => {};
try {
  // Written by the admin-ops work; optional here so this module never fails to load.
  ({ recordAudit } = require("../lib/audit"));
} catch (err) {
  // no audit module yet
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function userIdsMatching(q) {
  const rx = new RegExp(escapeRegex(q), "i");
  const users = await Customer.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] }).select("_id").lean();
  return users.map((u) => u._id);
}

// GET /payments?status=&type=&q=&from=&to=&page=&limit=
exports.listPayments = async (req, res) => {
  try {
    const { status, type, q, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 25));
    const filter = {};
    if (status === "unreconciled") filter.status = { $in: ["created", "processing"] };
    else if (status === "attention") filter.$or = [{ status: "amount_mismatch" }, { applyError: { $exists: true, $ne: null } }];
    else if (status) filter.status = status;
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (q) {
      const ids = await userIdsMatching(q);
      filter.$and = [{ $or: [{ orderId: new RegExp(escapeRegex(q), "i") }, { trackingId: new RegExp(escapeRegex(q), "i") }, { user: { $in: ids } }] }];
    }
    const [rows, total] = await Promise.all([
      PaymentIntent.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "name email phone").lean(),
      PaymentIntent.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, total, page, limit, statusApiEnabled: statusApiEnabled() });
  } catch (err) {
    console.error("listPayments error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /payments/summary — counts for the admin badge/dashboard
exports.paymentsSummary = async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [byStatus, attention, successAmount] = await Promise.all([
      PaymentIntent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
      PaymentIntent.countDocuments({ $or: [{ status: "amount_mismatch" }, { applyError: { $exists: true, $ne: null } }, { status: "created", createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } }] }),
      PaymentIntent.aggregate([{ $match: { status: "success", settledAt: { $gte: since } } }, { $group: { _id: null, amount: { $sum: { $ifNull: ["$chargedAmount", "$amount"] } } } }]),
    ]);
    res.json({
      success: true,
      data: {
        last30Days: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
        needsAttention: attention,
        collectedLast30Days: (successAmount[0] && successAmount[0].amount) || 0,
        statusApiEnabled: statusApiEnabled(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /payments/:orderId
exports.getPayment = async (req, res) => {
  try {
    const intent = await PaymentIntent.findOne({ orderId: req.params.orderId }).populate("user", "name email phone").lean();
    if (!intent) return res.status(404).json({ success: false, message: "Unknown order" });
    const up = await UserPayment.findOne({ user: intent.user._id || intent.user }).lean();
    const gatewayRecords = up ? up.payments.filter((p) => p.order_id === intent.orderId) : [];
    const holidayMeals = intent.type === "holiday" ? await HolidayPayment.find({ "transactionDetails.order_id": intent.orderId }).lean() : [];
    res.json({ success: true, data: { intent, gatewayRecords, holidayMeals } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /payments/:orderId/reconcile — ask CCAvenue now
exports.reconcilePayment = async (req, res) => {
  try {
    if (!statusApiEnabled()) {
      return res.status(409).json({ success: false, message: "CCAvenue status API is not enabled on this server (CCAV_STATUS_API_ENABLED). Verify the order in the CCAvenue dashboard and use Confirm payment." });
    }
    const r = await reconcileOrder(req.params.orderId);
    await recordAudit(req, { action: "payment.reconcile", targetType: "PaymentIntent", targetId: req.params.orderId, after: { result: r.message, status: r.status } });
    res.status(r.ok ? 200 : 502).json({ success: r.ok, message: r.message, status: r.status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /payments/:orderId/confirm { trackingId, amount, note } — admin verified it in the CCAvenue dashboard
exports.confirmPayment = async (req, res) => {
  try {
    const { trackingId, amount, note } = req.body || {};
    const intent = await PaymentIntent.findOne({ orderId: req.params.orderId });
    if (!intent) return res.status(404).json({ success: false, message: "Unknown order" });
    if (!["created", "processing", "expired", "failed"].includes(intent.status)) {
      return res.status(409).json({ success: false, message: `Order is already ${intent.status}` });
    }
    if (!trackingId || !note) return res.status(400).json({ success: false, message: "trackingId (from CCAvenue) and a note are required" });
    const charged = amount != null ? Number(amount) : intent.amount;
    if (!(charged > 0)) return res.status(400).json({ success: false, message: "Invalid amount" });

    // Re-open an expired/failed intent so the atomic claim in settleOrder can take it.
    if (intent.status !== "created") {
      await PaymentIntent.updateOne({ _id: intent._id }, { $set: { status: "created" } });
    }
    const settled = await settleOrder(
      {
        orderId: intent.orderId,
        orderStatus: "Success",
        trackingId: String(trackingId),
        amount: charged,
        userId: String(intent.user),
        paymentMode: "Manual",
        statusMessage: `Confirmed by admin: ${note}`,
        merchantParams: {},
        raw: { manual: true, note },
      },
      { via: "manual", admin: req.user && req.user._id, note }
    );
    await recordAudit(req, { action: "payment.confirm", targetType: "PaymentIntent", targetId: intent.orderId, reason: note, after: { status: settled.status, trackingId, amount: charged } });
    res.json({ success: settled.outcome === "success", status: settled.status, applied: settled.applied || null, applyError: settled.applyError || null });
  } catch (err) {
    console.error("confirmPayment error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /payments/:orderId/retry-apply — paid but the business effect failed
exports.retryApplyPayment = async (req, res) => {
  try {
    const r = await retryApply(req.params.orderId, { admin: req.user && req.user._id });
    await recordAudit(req, { action: "payment.retryApply", targetType: "PaymentIntent", targetId: req.params.orderId, after: { ok: r.ok, message: r.message } });
    res.status(r.ok ? 200 : 409).json({ success: r.ok, message: r.message, applied: r.applied || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /payments/run-reconciliation — run the job now
exports.runReconciliationNow = async (req, res) => {
  try {
    const summary = await runReconcilePayments();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /payments/customer/:userId — gateway log for one customer
exports.customerPayments = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid user" });
    const [intents, up] = await Promise.all([
      PaymentIntent.find({ user: userId }).sort({ createdAt: -1 }).lean(),
      UserPayment.findOne({ user: userId }).lean(),
    ]);
    res.json({ success: true, data: { intents, gateway: up ? [...up.payments].reverse() : [], totals: up ? { total_amount: up.total_amount, total_payments: up.total_payments } : null } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
