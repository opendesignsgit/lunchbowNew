const mongoose = require("mongoose");

/**
 * One row per reminder actually sent to a customer, so a job that runs twice
 * (or a redeploy mid-run) never sends the same reminder again.
 */
const ReminderLogSchema = new mongoose.Schema(
  {
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    kind: { type: String, enum: ["renewal", "meal"], required: true },
    daysBefore: { type: Number, default: 0 },
    // Meal reminders: the working day the reminder was about ("YYYY-MM-DD").
    dateKey: { type: String, default: "" },
    channel: { type: String, enum: ["email", "sms", "push"], required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ReminderLogSchema.index({ subscriptionId: 1, kind: 1, daysBefore: 1, channel: 1 });
ReminderLogSchema.index({ userId: 1, kind: 1, dateKey: 1 });

module.exports = mongoose.models.ReminderLog || mongoose.model("ReminderLog", ReminderLogSchema);
