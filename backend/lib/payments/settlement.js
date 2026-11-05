/**
 * Payment settlement — the single path every payment result goes through, whether it
 * arrives as a CCAvenue browser callback, from the reconciliation job (status API), an
 * admin's manual confirmation, or a dev-only test call.
 *
 *   settleOrder(result, { via })
 *     result = { orderId, orderStatus, trackingId, amount, userId, paymentMode,
 *                statusMessage, raw }   (see normalizeGatewayResponse)
 *
 * Guarantees:
 *  - idempotent per orderId: the PaymentIntent is claimed atomically
 *    (created → processing); a second delivery sees the final status and is a no-op;
 *  - a Success whose amount or user differs from what the server priced is NOT
 *    applied (status amount_mismatch, admin alerted);
 *  - every gateway result is recorded once in UserPayment (failed attempts included),
 *    but only successes count towards total_amount;
 *  - money captured is never lost: if applying the business effect throws, the intent
 *    stays `success` with `applyError` set and the admin is alerted.
 *
 * Website checkouts from before the server-side flow carrive without an intent; a
 * `legacy` intent is created from the gateway data (type from the order-id prefix and
 * merchant params) so they settle the same way. Set CCAV_ACCEPT_LEGACY_CALLBACKS=false
 * once the website is on /api/ccavenue/initiate to reject them.
 */
const mongoose = require("mongoose");
const PaymentIntent = require("../../models/PaymentIntent");
const UserPayment = require("../../models/Payment");
const { APPLIERS } = require("./apply");
const { notifyAdmin } = require("../notify");

const FINAL = new Set(["success", "failed", "amount_mismatch", "expired"]);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalises a decrypted CCAvenue callback (querystring-parsed) into a settlement result. */
function normalizeGatewayResponse(data) {
  const d = data || {};
  return {
    orderId: String(d.order_id || "").trim(),
    orderStatus: String(d.order_status || "").trim() || "Unknown",
    trackingId: d.tracking_id ? String(d.tracking_id) : null,
    amount: num(d.amount),
    userId: d.merchant_param1 ? String(d.merchant_param1) : null,
    paymentMode: d.payment_mode || null,
    statusMessage: d.status_message || d.failure_message || null,
    bankRefNo: d.bank_ref_no || null,
    billingName: d.billing_name || null,
    billingEmail: d.billing_email || null,
    merchantParams: {
      p1: d.merchant_param1,
      p2: d.merchant_param2,
      p3: d.merchant_param3,
      p4: d.merchant_param4,
      p5: d.merchant_param5,
    },
    raw: d,
  };
}

const decodeBase64Json = (s) => {
  try {
    return JSON.parse(Buffer.from(String(s || ""), "base64").toString("utf8"));
  } catch (err) {
    return null;
  }
};

/** Builds an intent for a callback that has none (old website checkout). */
function legacyIntentFields(result) {
  const id = result.orderId;
  const mp = result.merchantParams;
  let type = null;
  const meta = { legacy: true };
  if (/^LB-HOLIDAY/i.test(id)) {
    type = "holiday";
    meta.mealDate = mp.p2;
    meta.childrenData = decodeBase64Json(mp.p3) || [];
  } else if (/^RENEW/i.test(id) || /^R/.test(id)) {
    type = "renewal";
    meta.walletUsed = num(mp.p4) || 0;
  } else if (/^L/i.test(id)) {
    const children = decodeBase64Json(mp.p3);
    if (mongoose.Types.ObjectId.isValid(mp.p2) && Array.isArray(children)) {
      type = "addChild";
      meta.subscriptionId = mp.p2;
      meta.children = children;
    } else {
      type = "subscription";
    }
  }
  return { type, meta };
}

/** Records the gateway result on the customer's UserPayment document (once per order+status). */
async function recordUserPayment(result, intent, { counted = result.orderStatus === "Success", note } = {}) {
  const userId = intent ? intent.user : result.userId;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return;
  const isSuccess = counted;
  const entry = {
    order_id: result.orderId,
    tracking_id: result.trackingId || undefined,
    amount: result.amount != null ? result.amount : intent ? intent.amount : 0,
    currency: "INR",
    order_status: result.orderStatus,
    payment_mode: result.paymentMode || undefined,
    status_message: note || result.statusMessage || undefined,
    bank_ref_no: result.bankRefNo || undefined,
    billing_name: result.billingName || undefined,
    billing_email: result.billingEmail || undefined,
    payment_type: intent ? intent.type : undefined,
    paidFor: intent
      ? { subscription: "SUBSCRIPTION", renewal: "RENEW_SUBSCRIPTION", addChild: "ADD_CHILD", holiday: "HOLIDAY_PAY", tryMeal: "TRY_MEAL" }[intent.type]
      : null,
    merchant_param1: String(userId),
    merchant_param2: result.merchantParams.p2 || undefined,
    merchant_param4: result.merchantParams.p4 || undefined,
    merchant_param5: result.merchantParams.p5 || undefined,
  };
  const existing = await UserPayment.findOne({
    user: userId,
    payments: { $elemMatch: { order_id: result.orderId, order_status: result.orderStatus } },
  }).select("_id");
  if (existing) return;
  await UserPayment.updateOne(
    { user: userId },
    {
      $push: { payments: entry },
      ...(isSuccess ? { $inc: { total_amount: entry.amount, total_payments: 1 } } : {}),
      $setOnInsert: { created_at: new Date() },
      $set: { updated_at: new Date() },
    },
    { upsert: true }
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits briefly for a concurrent settlement of the same order to finish. */
async function waitForFinal(intentId, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await sleep(250);
    const i = await PaymentIntent.findById(intentId);
    if (!i || FINAL.has(i.status)) return i;
  }
  return PaymentIntent.findById(intentId);
}

const outcomeOf = (intent) => ({
  outcome: intent.status === "success" ? "success" : "failed",
  status: intent.status,
  replay: true,
  intent,
  type: intent.type,
  orderId: intent.orderId,
  applyError: intent.applyError || null,
});

/**
 * Settles one gateway result. `via`: callback | reconcile | manual | local.
 * Returns { outcome: 'success'|'failed'|'ignored', status, intent, type, orderId, applied?, message? }.
 */
async function settleOrder(result, { via = "callback", admin = null, note = null } = {}) {
  if (!result || !result.orderId) {
    return { outcome: "ignored", status: "invalid", message: "Missing order id" };
  }

  let intent = await PaymentIntent.findOne({ orderId: result.orderId });

  if (!intent) {
    if (process.env.CCAV_ACCEPT_LEGACY_CALLBACKS === "false") {
      return { outcome: "ignored", status: "unknown_order", message: "Unknown order id" };
    }
    const { type, meta } = legacyIntentFields(result);
    if (!type || !result.userId || !mongoose.Types.ObjectId.isValid(result.userId)) {
      return { outcome: "ignored", status: "unknown_order", message: "Unknown order id or user" };
    }
    try {
      intent = await PaymentIntent.create({
        orderId: result.orderId,
        user: result.userId,
        type,
        amount: result.amount != null ? result.amount : 0,
        source: "legacy",
        meta,
      });
    } catch (err) {
      // created concurrently by another delivery
      intent = await PaymentIntent.findOne({ orderId: result.orderId });
      if (!intent) throw err;
    }
  }

  // Atomic claim: only one caller gets to apply this order.
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: "created" },
    { $set: { status: "processing", lastCheckedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) {
    let current = await PaymentIntent.findById(intent._id);
    if (current && current.status === "processing") current = await waitForFinal(current._id);
    if (current && FINAL.has(current.status)) return outcomeOf(current);
    // Still processing after the wait (slow apply): report as pending success/failure unknown.
    return { outcome: "failed", status: "processing", replay: true, intent: current, type: intent.type, orderId: intent.orderId, message: "Payment is still being processed" };
  }
  intent = claimed;

  const isSuccess = result.orderStatus === "Success";
  // Validate what was charged against what the server priced (not possible for legacy).
  const userMatches = !result.userId || String(result.userId) === String(intent.user);
  const amountMatches =
    intent.source === "legacy" ||
    result.amount == null ||
    Math.abs(result.amount - intent.amount) <= 0.01;
  const mismatch = isSuccess && (!userMatches || !amountMatches);

  try {
    await recordUserPayment(result, intent, {
      counted: isSuccess && !mismatch,
      note: mismatch ? `AMOUNT/USER MISMATCH – not applied (expected ₹${intent.amount})` : undefined,
    });
  } catch (err) {
    console.error("[settle] recordUserPayment failed:", err && err.message);
  }

  const common = {
    trackingId: result.trackingId || intent.trackingId,
    chargedAmount: result.amount,
    paymentMode: result.paymentMode,
    gatewayStatus: result.orderStatus,
    statusMessage: result.statusMessage,
    settledAt: new Date(),
    settledVia: via,
    ...(admin ? { settledBy: admin } : {}),
    ...(note ? { note } : {}),
  };

  if (!isSuccess) {
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { ...common, status: "failed" } });
    notifyAdmin({
      type: "payment.failed",
      severity: "warning",
      title: `Payment ${result.orderStatus.toLowerCase()} – ${intent.type}`,
      message: `Order ${intent.orderId} (${intent.type}) ended as ${result.orderStatus}${result.statusMessage ? `: ${result.statusMessage}` : ""}.`,
      userId: intent.user,
      meta: { orderId: intent.orderId, type: intent.type, amount: intent.amount, via },
    });
    return { outcome: "failed", status: "failed", intent, type: intent.type, orderId: intent.orderId };
  }

  if (mismatch) {
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { ...common, status: "amount_mismatch" } });
    console.error("[PAYMENT MISMATCH]", { orderId: intent.orderId, expected: intent.amount, charged: result.amount, userMatches });
    notifyAdmin({
      type: "payment.mismatch",
      severity: "critical",
      title: "Payment amount/user mismatch – not applied",
      message: `Order ${intent.orderId}: server priced ₹${intent.amount}, gateway charged ₹${result.amount}${userMatches ? "" : " for a different user"}. Nothing was activated; review in Payments.`,
      userId: intent.user,
      meta: { orderId: intent.orderId, type: intent.type, expected: intent.amount, charged: result.amount, via },
    });
    return { outcome: "failed", status: "amount_mismatch", intent, type: intent.type, orderId: intent.orderId };
  }

  const payment = {
    orderId: intent.orderId,
    trackingId: result.trackingId || null,
    amount: result.amount != null ? result.amount : intent.amount,
    paymentMode: result.paymentMode,
  };
  const applier = APPLIERS[intent.type];
  let applied = null;
  let applyError = null;
  try {
    if (!applier) throw new Error(`No applier for payment type ${intent.type}`);
    applied = await applier({ intent, payment, via });
  } catch (err) {
    applyError = (err && err.message) || String(err);
    console.error("[settle] apply failed:", intent.orderId, applyError);
  }

  await PaymentIntent.updateOne(
    { _id: intent._id },
    { $set: { ...common, status: "success", applyError: applyError || undefined } }
  );
  const final = await PaymentIntent.findById(intent._id);

  if (applyError) {
    notifyAdmin({
      type: "payment.unapplied",
      severity: "critical",
      title: "Payment captured but NOT applied",
      message: `Order ${intent.orderId} (${intent.type}, ₹${payment.amount}) was paid but applying it failed: ${applyError}. Fix from Payments → Retry apply.`,
      userId: intent.user,
      meta: { orderId: intent.orderId, type: intent.type, amount: payment.amount, via, applyError },
    });
  } else {
    const titles = {
      subscription: "New subscription paid",
      renewal: "Renewal paid",
      addChild: "Child added (paid)",
      holiday: "Extra-day meal paid",
    };
    const kind = (applied && applied.kind) || intent.type;
    notifyAdmin({
      type: kind === "renewal" ? "renewal.paid" : kind === "addChild" ? "child.added" : kind === "holiday" ? "holiday.booked" : "payment.success",
      severity: "info",
      title: titles[kind] || "Payment received",
      message: `${(applied && applied.parentName) || "Customer"} paid ₹${payment.amount} (${kind}, order ${intent.orderId}, via ${via}).`,
      userId: intent.user,
      meta: { orderId: intent.orderId, type: kind, amount: payment.amount, via, ...(applied || {}) },
    });
  }

  return { outcome: "success", status: "success", intent: final, type: intent.type, orderId: intent.orderId, applied, applyError };
}

/** Re-runs the business effect for a paid intent whose apply failed (admin action). */
async function retryApply(orderId, { admin } = {}) {
  const intent = await PaymentIntent.findOne({ orderId });
  if (!intent) return { ok: false, message: "Unknown order" };
  if (intent.status !== "success") return { ok: false, message: `Order is ${intent.status}, not paid` };
  const applier = APPLIERS[intent.type];
  try {
    const applied = await applier({
      intent,
      payment: { orderId: intent.orderId, trackingId: intent.trackingId, amount: intent.chargedAmount != null ? intent.chargedAmount : intent.amount },
      via: "manual",
    });
    await PaymentIntent.updateOne({ _id: intent._id }, { $unset: { applyError: "" }, $set: { settledBy: admin || undefined } });
    return { ok: true, applied };
  } catch (err) {
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { applyError: (err && err.message) || String(err) } });
    return { ok: false, message: (err && err.message) || String(err) };
  }
}

module.exports = { settleOrder, normalizeGatewayResponse, legacyIntentFields, recordUserPayment, retryApply, FINAL };
