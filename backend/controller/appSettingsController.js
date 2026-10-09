/**
 * App Settings Controller
 *
 * Serves runtime-configurable business logic values from environment variables.
 * The dashboard can override these values in the future by updating .env and
 * restarting the server (or via a DB-backed settings collection).
 *
 * All values have sensible hard-coded defaults so the app works even when the
 * env vars are not set.
 */

const { getPricingConfig, envNumber } = require("../lib/pricing");

const getAppSettings = (req, res) => {
  try {
    const settings = {
      ...getPricingConfig(),

      // ── Ordering rules (mirrors the website) ─────────────────────────────────
      // Meals can be changed or deleted only for dates after today (IST).
      mealLockDaysAhead: envNumber("MEAL_LOCK_DAYS_AHEAD", 1),
      lunchTimeSlots: ["11:00 AM - 12:00 PM", "12:00 PM - 01:00 PM"],

      // ── Trial @ 99 (an enquiry only; the team collects payment offline) ─────
      trialEnabled: process.env.ENABLE_TRIAL === "true",
      trialPrice: envNumber("TRIAL_PRICE", 99),

      // ── Support ───────────────────────────────────────────────────────────────
      supportPhone: process.env.SUPPORT_PHONE || "+91 91769 17602",
      supportEmail: process.env.SUPPORT_EMAIL || "contactus@lunchbowl.co.in",
      whatsappNumber: process.env.WHATSAPP_NUMBER || "919345407191",
    };

    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error("getAppSettings error:", err);
    return res.status(500).json({ success: false, message: "Failed to load app settings" });
  }
};

module.exports = { getAppSettings };
