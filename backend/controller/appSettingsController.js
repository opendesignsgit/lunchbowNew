/**
 * App Settings Controller
 *
 * Serves the runtime-configurable business values to the app and website:
 * hard-coded defaults ← .env ← admin dashboard overrides (PUT /api/admin-ops/settings,
 * stored in the BusinessSetting collection and cached by lib/settingsStore).
 *
 * All values have sensible hard-coded defaults so the app works even when the
 * env vars are not set.
 */

const { getPricingConfig } = require("../lib/pricing");

// Admin-only values that live in the same settings object but must not be public.
const PRIVATE_KEYS = ["adminNotifyEmails", "notificationChannels"];

const getAppSettings = (req, res) => {
  try {
    // Defaults ← .env ← admin dashboard overrides (lib/pricing + lib/settingsStore).
    const cfg = getPricingConfig();
    for (const k of PRIVATE_KEYS) delete cfg[k];

    const settings = {
      ...cfg,
      lunchTimeSlots: ["11:00 AM - 12:00 PM", "12:00 PM - 01:00 PM"],

      // ── Test payments (dev/local only) ──────────────────────────────────────
      // When the test-only payment endpoints are enabled (see middleware/localPaymentsOnly.js),
      // the app shows a "TEST PAYMENT" button that skips CCAvenue. Never set on the live API.
      testPaymentsEnabled:
        process.env.ALLOW_LOCAL_PAYMENTS === "true" || process.env.CCAV_MODE === "test",
    };

    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    console.error("getAppSettings error:", err);
    return res.status(500).json({ success: false, message: "Failed to load app settings" });
  }
};

module.exports = { getAppSettings };
