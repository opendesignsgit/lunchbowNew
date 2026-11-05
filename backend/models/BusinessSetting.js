const mongoose = require("mongoose");

/**
 * Runtime business settings edited from the admin dashboard.
 *
 * A single document (key: "business") whose `values` object has the same shape as
 * lib/pricing getPricingConfig(). Anything stored here overrides the .env value;
 * lib/settingsStore.js caches it so pricing lookups stay synchronous.
 */
const BusinessSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "business" },
    values: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true, minimize: false }
);

module.exports =
  mongoose.models.BusinessSetting || mongoose.model("BusinessSetting", BusinessSettingSchema);
