/**
 * Payment reconciliation.
 *
 * Settles payments whose gateway callback never reached us (the customer paid by UPI,
 * switched apps and never came back, closed the tab, lost the connection…). For every
 * intent still `created` a few minutes after it was made, ask CCAvenue's order status
 * API what happened and settle exactly as the callback would have.
 *
 * Without the status API (CCAV_STATUS_API_ENABLED unset) the job cannot settle
 * anything; it still flags intents older than RECONCILE_ALERT_AFTER_MINUTES to the
 * admin as "unreconciled" and expires intents older than RECONCILE_EXPIRE_HOURS.
 */
const PaymentIntent = require("../models/PaymentIntent");
const { fetchOrderStatus, isEnabled } = require("../lib/ccavenueStatus");
const { settleOrder } = require("../lib/payments/settlement");
const { notifyAdmin } = require("../lib/notify");

const minutes = (n) => n * 60 * 1000;
const MIN_AGE_MIN = Number(process.env.RECONCILE_MIN_AGE_MINUTES || 5);
const ALERT_AFTER_MIN = Number(process.env.RECONCILE_ALERT_AFTER_MINUTES || 30);
const EXPIRE_HOURS = Number(process.env.RECONCILE_EXPIRE_HOURS || 72);
const BATCH = Number(process.env.RECONCILE_BATCH || 50);

/** Reconcile one order now (used by the job and the admin "check with CCAvenue" action). */
async function reconcileOrder(orderId) {
  const intent = await PaymentIntent.findOne({ orderId });
  if (!intent) return { ok: false, message: "Unknown order" };
  if (!["created", "processing"].includes(intent.status)) {
    return { ok: true, message: `Already ${intent.status}`, status: intent.status };
  }
  const status = await fetchOrderStatus(orderId);
  await PaymentIntent.updateOne({ _id: intent._id }, { $set: { lastCheckedAt: new Date() } });
  if (!status.ok) return { ok: false, message: status.error || "Status lookup failed", status: intent.status };
  if (status.orderStatus === "Pending") return { ok: true, message: "Gateway still reports pending", status: "created", gatewayStatus: status.gatewayStatus };

  const settled = await settleOrder(
    {
      orderId,
      orderStatus: status.orderStatus,
      trackingId: status.trackingId,
      amount: status.amount,
      userId: String(intent.user),
      paymentMode: status.paymentMode,
      statusMessage: status.gatewayStatus,
      merchantParams: {},
      raw: status.raw,
    },
    { via: "reconcile" }
  );
  return { ok: true, message: `Settled as ${settled.status}`, status: settled.status, settled };
}

async function runReconcilePayments() {
  const now = Date.now();
  const summary = { checked: 0, settled: 0, stillPending: 0, failedLookups: 0, expired: 0, alerted: 0 };

  // 1. Expire very old unsettled intents.
  const expireBefore = new Date(now - EXPIRE_HOURS * 3600 * 1000);
  const expired = await PaymentIntent.updateMany(
    { status: "created", createdAt: { $lt: expireBefore } },
    { $set: { status: "expired", settledAt: new Date(), settledVia: "reconcile", statusMessage: "No gateway result within the reconciliation window" } }
  );
  summary.expired = expired.nModified != null ? expired.nModified : expired.modifiedCount || 0;

  // 2. Ask CCAvenue about recent unsettled intents.
  const candidates = await PaymentIntent.find({
    status: "created",
    createdAt: { $lt: new Date(now - minutes(MIN_AGE_MIN)) },
  })
    .sort({ createdAt: 1 })
    .limit(BATCH);

  if (isEnabled()) {
    for (const intent of candidates) {
      summary.checked++;
      try {
        const r = await reconcileOrder(intent.orderId);
        if (!r.ok) summary.failedLookups++;
        else if (r.status === "created") summary.stillPending++;
        else summary.settled++;
      } catch (err) {
        summary.failedLookups++;
        console.error("[reconcile] error for", intent.orderId, err && err.message);
      }
    }
  }

  // 3. Alert once about intents that stayed unreconciled too long.
  const alertBefore = new Date(now - minutes(ALERT_AFTER_MIN));
  const stale = await PaymentIntent.find({
    status: "created",
    createdAt: { $lt: alertBefore },
    "meta.unreconciledAlerted": { $ne: true },
  }).limit(BATCH);
  for (const intent of stale) {
    await notifyAdmin({
      type: "payment.unreconciled",
      severity: isEnabled() ? "warning" : "critical",
      title: "Payment started but no result received",
      message: `Order ${intent.orderId} (${intent.type}, ₹${intent.amount}) was started ${Math.round((now - intent.createdAt) / 60000)} min ago and CCAvenue has not confirmed it${isEnabled() ? "" : " (status API not enabled — check the CCAvenue dashboard and settle manually from Payments)"}.`,
      userId: intent.user,
      meta: { orderId: intent.orderId, type: intent.type, amount: intent.amount },
    });
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { "meta.unreconciledAlerted": true } });
    summary.alerted++;
  }

  if (summary.checked || summary.expired || summary.alerted) console.log("[reconcile]", summary);
  return summary;
}

module.exports = { runReconcilePayments, reconcileOrder };
