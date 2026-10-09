const mongoose = require("mongoose");

/**
 * A payment the server has priced and encrypted for CCAvenue.
 *
 * Created by POST /api/ccavenue/initiate (used by the mobile app). The CCAvenue
 * response handlers look the order up here so they can check the amount actually
 * charged, take the order details from the server instead of the client, refuse
 * replays, and send app users back to the app instead of the website.
 */
const PaymentIntentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    type: {
      type: String,
      enum: ["subscription", "renewal", "addChild", "holiday"],
      required: true,
    },
    amount: { type: Number, required: true },
    source: { type: String, enum: ["app", "web"], default: "app" },
    status: {
      type: String,
      enum: ["created", "success", "failed", "amount_mismatch"],
      default: "created",
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    trackingId: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.PaymentIntent || mongoose.model("PaymentIntent", PaymentIntentSchema);
