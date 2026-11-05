const mongoose = require("mongoose");

/** FCM device token registered by an admin's phone/browser for push alerts. */
const AdminDeviceSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, default: "unknown" }, // android | ios | web
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AdminDeviceSchema.index({ adminId: 1 });

module.exports = mongoose.models.AdminDevice || mongoose.model("AdminDevice", AdminDeviceSchema);
