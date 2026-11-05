const mongoose = require("mongoose");

/**
 * A payment the server has priced and (for app/web checkouts) encrypted for CCAvenue.
 *
 * Every settlement goes through lib/payments/settlement.js, which claims the intent
 * atomically (created → processing → success|failed|amount_mismatch) so a replayed
 * or concurrent gateway callback can never apply a payment twice. Payments from the
 * website's old client-side checkout arrive without an intent; settlement creates a
 * `legacy` one from the gateway response so they follow the same path.
 *
 * `meta` holds everything needed to apply the payment later (plan snapshot, children,
 * holiday meals), so a payment can be settled by the reconciliation job even when the
 * customer's browser never came back from the gateway.
 */
const PaymentIntentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: {
      type: String,
      enum: ["subscription", "renewal", "addChild", "holiday", "tryMeal"],
      required: true,
    },
    amount: { type: Number, required: true },
    source: { type: String, enum: ["app", "web", "legacy", "manual"], default: "app" },
    status: {
      type: String,
      enum: ["created", "processing", "success", "failed", "amount_mismatch", "expired"],
      default: "created",
      index: true,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Settlement details
    trackingId: { type: String },
    chargedAmount: { type: Number },
    paymentMode: { type: String },
    gatewayStatus: { type: String },
    statusMessage: { type: String },
    settledAt: { type: Date },
    /** callback | reconcile | manual | local */
    settledVia: { type: String },
    attempts: { type: Number, default: 0 },
    lastCheckedAt: { type: Date },
    /** Set when money was captured but applying the business effect failed (needs admin attention). */
    applyError: { type: String },
    /** Admin note for manual settlements */
    note: { type: String },
    settledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

PaymentIntentSchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models.PaymentIntent || mongoose.model("PaymentIntent", PaymentIntentSchema);
