const mongoose = require("mongoose");

/** In-dashboard notification for the LunchBowl team (see lib/notify). */
const AdminNotificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Channels this event was routed to (dashboard | email | push | digest).
    channels: { type: [String], default: ["dashboard"] },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Admin" }],
    readAt: { type: Date },
    emailed: { type: Boolean, default: false },
    pushed: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

AdminNotificationSchema.index({ createdAt: -1 });
AdminNotificationSchema.index({ type: 1, createdAt: -1 });
AdminNotificationSchema.index({ userId: 1, createdAt: -1 });
AdminNotificationSchema.index({ emailed: 1, severity: 1 });

module.exports =
  mongoose.models.AdminNotification ||
  mongoose.model("AdminNotification", AdminNotificationSchema);
