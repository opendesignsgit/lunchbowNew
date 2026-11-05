/**
 * CCAvenue HTTP handlers.
 *
 * All three gateway callbacks (subscription/renewal, holiday meal, add-child) decrypt
 * the response and hand it to lib/payments/settlement.js, which is also used by the
 * reconciliation job and the admin tools. Nothing payment-related is decided here.
 */
const qs = require("querystring");
const mongoose = require("mongoose");
const ccav = require("../utils/ccavutil");
const HolidayPayment = require("../models/HolidayPayment");
const PaymentIntent = require("../models/PaymentIntent");
const Subscription = require("../models/subscriptionModel");
const { getCcavConfig } = require("../lib/ccavenue");
const { settleOrder, normalizeGatewayResponse } = require("../lib/payments/settlement");
const { redirectUrlFor } = require("../lib/payments/redirects");
const { toDateKey } = require("../lib/pricing");

const readBody = (req) =>
  new Promise((resolve) => {
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      return resolve(req.body);
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(qs.parse(raw)));
    req.on("error", () => resolve({}));
  });

/**
 * Shared callback handler. CCAvenue POSTs `encResp` (form-encoded) to the redirect
 * or cancel URL through the customer's browser.
 */
async function handleGatewayCallback(req, res, expectedType) {
  try {
    const body = await readBody(req);
    const encrypted = body && body.encResp;
    if (!encrypted) return res.status(400).send("Missing encrypted response");

    let data;
    try {
      data = qs.parse(ccav.decrypt(String(encrypted), getCcavConfig().workingKey));
    } catch (err) {
      console.error("CCAvenue callback: decryption failed:", err && err.message);
      return res.status(400).send("Failed to decrypt payment response");
    }

    const result = normalizeGatewayResponse(data);
    if (!result.orderId) return res.status(400).send("Missing order id");

    const settled = await settleOrder(result, { via: "callback" });
    if (settled.outcome === "ignored") {
      console.warn("CCAvenue callback ignored:", result.orderId, settled.message);
      return res.status(400).send(settled.message || "Unknown order");
    }
    return res.redirect(
      redirectUrlFor({ req, intent: settled.intent, settled, type: expectedType, orderId: result.orderId })
    );
  } catch (err) {
    console.error("CCAvenue callback error:", err);
    return res.status(500).send("Internal Server Error");
  }
}

exports.ccavenueResponse = (req, res) => handleGatewayCallback(req, res, "subscription");
exports.holiydayPayment = (req, res) => handleGatewayCallback(req, res, "holiday");
exports.addChildPaymentController = (req, res) => handleGatewayCallback(req, res, "addChild");

// POST /ccavenue/holiday-payments { date, userId } → paid holiday meals for that date
exports.getHolidayPaymentsByDate = async (req, res) => {
  const { date, userId } = req.body;
  if (!date || !userId) {
    return res.status(400).json({ error: "date and userId are required in request body" });
  }
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }
    const payments = await HolidayPayment.find({ mealDate: date, userId }).select("-__v -createdAt -updatedAt");
    return res.json(payments || []);
  } catch (err) {
    console.error("Error fetching holiday payments:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─── Test-only settlement (routes are closed on the live API, see middleware/localPaymentsOnly) ───

const syntheticResult = (orderId, userId, amount, transactionId, extra = {}) => ({
  orderId,
  orderStatus: "Success",
  trackingId: transactionId || `TEST_${Date.now()}`,
  amount,
  userId: String(userId),
  paymentMode: "Test",
  statusMessage: "Simulated payment",
  merchantParams: { p1: String(userId), ...extra },
  raw: { simulated: true },
});

const jsonFor = (res, settled, okMessage) => {
  if (settled.outcome === "success") {
    return res.json({
      success: true,
      message: settled.applyError ? `Payment recorded but not applied: ${settled.applyError}` : okMessage,
      orderId: settled.orderId,
      applied: settled.applied || null,
    });
  }
  return res.status(400).json({ success: false, message: settled.message || `Payment ${settled.status}`, orderId: settled.orderId });
};

/** POST /local-success { userId, orderId, transactionId, walletUsed? } — first plan or renewal. */
exports.localPaymentSuccess = async (req, res) => {
  try {
    const { userId, orderId, transactionId, walletUsed } = req.body;
    if (!userId || !orderId) return res.status(400).json({ success: false, message: "Missing userId or orderId" });
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid userId" });

    const intent = await PaymentIntent.findOne({ orderId });
    let amount = intent ? intent.amount : null;
    if (amount == null) {
      const pending = await Subscription.findOne({ user: userId, status: "pending_payment" }).sort({ _id: -1 });
      if (!pending) return res.status(404).json({ success: false, message: "No pending plan to pay for" });
      amount = Number(pending.price) || 0;
    }
    const settled = await settleOrder(
      syntheticResult(orderId, userId, amount, transactionId, { p4: walletUsed != null ? String(walletUsed) : undefined }),
      { via: "local" }
    );
    return jsonFor(res, settled, "Payment simulated successfully");
  } catch (err) {
    console.error("Local payment success error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/** POST /local-success/local-add-childPayment { userId, childrenData, paymentInfo:{orderId, transactionId, subscriptionId, paymentAmount} } */
exports.localAddChildPaymentController = async (req, res) => {
  try {
    const { userId, childrenData, paymentInfo } = req.body;
    if (!userId || !paymentInfo) return res.status(400).json({ success: false, message: "Missing required fields: userId or paymentInfo" });
    const { orderId, transactionId, subscriptionId, paymentAmount } = paymentInfo;
    if (!orderId || !subscriptionId) return res.status(400).json({ success: false, message: "Missing orderId or subscriptionId in paymentInfo" });
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ success: false, message: "Invalid userId or subscriptionId" });
    }
    let intent = await PaymentIntent.findOne({ orderId });
    if (!intent) {
      if (!Array.isArray(childrenData) || childrenData.length === 0) {
        return res.status(400).json({ success: false, message: "childrenData must be a non-empty array" });
      }
      intent = await PaymentIntent.create({
        orderId,
        user: userId,
        type: "addChild",
        amount: Number(paymentAmount) || 0,
        source: "legacy",
        meta: { subscriptionId: String(subscriptionId), children: childrenData, legacy: true },
      });
    }
    const settled = await settleOrder(syntheticResult(orderId, userId, intent.amount, transactionId), { via: "local" });
    return jsonFor(res, settled, "Add-child payment simulated successfully");
  } catch (err) {
    console.error("Local add-child payment error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/** POST /local-holiday-success { userId, orderId, transactionId, childrenData:[{childId, mealName}], selectedDate, planId } */
exports.localHolidayPaymentSuccess = async (req, res) => {
  try {
    const { userId, orderId, transactionId, childrenData, selectedDate, planId } = req.body;
    if (!userId || !orderId) return res.status(400).json({ success: false, message: "Missing required fields" });
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ success: false, message: "Invalid userId" });

    let intent = await PaymentIntent.findOne({ orderId });
    if (!intent) {
      const dateKey = toDateKey(selectedDate);
      if (!dateKey || !planId || !Array.isArray(childrenData) || childrenData.length === 0) {
        return res.status(400).json({ success: false, message: "selectedDate, planId and childrenData are required" });
      }
      const { getPricingConfig } = require("../lib/pricing");
      intent = await PaymentIntent.create({
        orderId,
        user: userId,
        type: "holiday",
        amount: childrenData.length * getPricingConfig().holidayMealPricePerChild,
        source: "legacy",
        meta: {
          mealDate: dateKey,
          childrenData: childrenData.map((c) => ({
            childId: String(c.childId),
            dish: { mealName: c.mealName },
            mealDate: dateKey,
            planId: String(planId),
          })),
          legacy: true,
        },
      });
    }
    const settled = await settleOrder(syntheticResult(orderId, userId, intent.amount, transactionId), { via: "local" });
    return jsonFor(res, settled, "Local holiday payment processed successfully");
  } catch (err) {
    console.error("Local holiday payment error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};
