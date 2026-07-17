const AppSettings = require("../models/AppSettings");

/**
 * PUBLIC — store frontend reads pricing only (never mail config).
 * GET /api/settings/public
 */
const getPublicSettings = async (req, res) => {
  try {
    const s = await AppSettings.getSettings();
    return res.status(200).json({ success: true, pricing: s.pricing });
  } catch (err) {
    console.error("getPublicSettings error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * ADMIN — full settings for the dashtar Settings page.
 * GET /api/settings
 */
const getSettings = async (req, res) => {
  try {
    const s = await AppSettings.getSettings();
    return res.status(200).json({ success: true, data: s });
  } catch (err) {
    console.error("getSettings error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * ADMIN — update pricing and/or mail. Partial updates allowed.
 * PUT /api/settings
 */
const updateSettings = async (req, res) => {
  try {
    const { pricing, mail } = req.body;
    const s = await AppSettings.getSettings();

    if (pricing) {
      const numeric = [
        "basePricePerDay",
        "holidayMealPrice",
        "addChildPricePerDay",
        "adhocMealPrice",
        "walletCreditOnMealDelete",
        "walletRedeemCapPercent",
        "multiChildThreshold",
      ];
      for (const k of numeric) {
        if (pricing[k] !== undefined) {
          const v = Number(pricing[k]);
          if (!Number.isFinite(v) || v < 0) {
            return res.status(400).json({ success: false, message: `Invalid value for ${k}` });
          }
          s.pricing[k] = v;
        }
      }
      if (s.pricing.walletRedeemCapPercent > 100) {
        return res
          .status(400)
          .json({ success: false, message: "walletRedeemCapPercent must be 0-100" });
      }
      if (Array.isArray(pricing.planTiers)) {
        for (const t of pricing.planTiers) {
          const d = Number(t.days);
          const ds = Number(t.discountSingle ?? 0);
          const dm = Number(t.discountMulti ?? 0);
          if (!Number.isFinite(d) || d < 1) {
            return res.status(400).json({ success: false, message: "Tier days must be >= 1" });
          }
          if ([ds, dm].some((x) => !Number.isFinite(x) || x < 0 || x > 1)) {
            return res
              .status(400)
              .json({ success: false, message: "Discounts must be between 0 and 1" });
          }
        }
        s.pricing.planTiers = pricing.planTiers.map((t) => ({
          days: Number(t.days),
          discountSingle: Number(t.discountSingle ?? 0),
          discountMulti: Number(t.discountMulti ?? 0),
        }));
      }
    }

    if (mail) {
      if (mail.fromName !== undefined) s.mail.fromName = String(mail.fromName);
      if (mail.companyEmail !== undefined) s.mail.companyEmail = String(mail.companyEmail);
      if (mail.events) {
        // Accepts an array or a comma-separated string; drops invalid addresses.
        const parseEmails = (value) =>
          (Array.isArray(value) ? value : String(value).split(","))
            .map((e) => String(e).trim())
            .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

        for (const [key, ev] of Object.entries(mail.events)) {
          if (!s.mail.events[key]) continue; // ignore unknown events
          if (ev.recipients !== undefined)
            s.mail.events[key].recipients = parseEmails(ev.recipients);
          if (ev.cc !== undefined) s.mail.events[key].cc = parseEmails(ev.cc);
          if (ev.bcc !== undefined) s.mail.events[key].bcc = parseEmails(ev.bcc);
          if (ev.subject !== undefined) s.mail.events[key].subject = String(ev.subject);
          if (ev.enabled !== undefined) s.mail.events[key].enabled = !!ev.enabled;
        }
      }
    }

    s.updatedBy = req.body.updatedBy || req.admin?.email || "";
    await s.save();

    return res.status(200).json({ success: true, message: "Settings updated", data: s });
  } catch (err) {
    console.error("updateSettings error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ------------------------------------------------------------------
// Shared helpers — import these instead of hardcoding prices/recipients.
// ------------------------------------------------------------------

/**
 * Resolve a mail event's To/Cc/Bcc/subject/enabled from settings.
 * cc/bcc are `undefined` when empty so they can be spread straight into
 * nodemailer's mailOptions without sending empty headers.
 */
const getMailEvent = async (key) => {
  const empty = { recipients: "", cc: undefined, bcc: undefined, subject: "", enabled: false };
  try {
    const s = await AppSettings.getSettings();
    const ev = s.mail.events[key];
    if (!ev) return empty;
    const join = (arr) => ((arr || []).length ? arr.join(", ") : undefined);
    return {
      recipients: (ev.recipients || []).join(", "),
      cc: join(ev.cc),
      bcc: join(ev.bcc),
      subject: ev.subject || "",
      enabled: ev.enabled !== false,
    };
  } catch (e) {
    console.error(`getMailEvent(${key}) failed:`, e.message);
    return empty;
  }
};

/**
 * SERVER-SIDE PRICE CALCULATION — the authoritative price.
 * Never trust a price sent by the client; recompute it here.
 */
const calculateSubscriptionPrice = async ({ workingDays, childCount }) => {
  const s = await AppSettings.getSettings();
  const days = Number(workingDays);
  const kids = Number(childCount);
  if (!Number.isFinite(days) || days < 1) throw new Error("Invalid workingDays");
  if (!Number.isFinite(kids) || kids < 1) throw new Error("Invalid childCount");

  const base = s.pricing.basePricePerDay;
  const isMulti = kids >= s.pricing.multiChildThreshold;

  // Discount applies only to a matching tier; custom date ranges get none.
  const tier = s.pricing.planTiers.find((t) => t.days === days);
  const discount = tier ? (isMulti ? tier.discountMulti : tier.discountSingle) : 0;

  const price = Math.round(days * base * (1 - discount) * kids);
  return { price, basePricePerDay: base, discount, workingDays: days, childCount: kids };
};

/**
 * LOG-ONLY price audit (phase 1 of server-side enforcement).
 * Recomputes the authoritative price and logs any disagreement with the
 * client-supplied value. Never throws — switch call sites to use the returned
 * `expected` value once the [PRICE-AUDIT] logs are clean.
 *
 * `walletUsed` is subtracted because the renew flow posts (price - walletUsed).
 */
const auditSubscriptionPrice = async ({
  label,
  userId,
  workingDays,
  childCount,
  clientPrice,
  walletUsed = 0,
}) => {
  try {
    const { price } = await calculateSubscriptionPrice({ workingDays, childCount });
    const expected = Math.round(price - (Number(walletUsed) || 0));
    const client = Math.round(Number(clientPrice));
    if (!Number.isFinite(client) || client !== expected) {
      console.warn(
        `[PRICE-AUDIT][${label}] MISMATCH user=${userId} days=${workingDays} ` +
          `children=${childCount} walletUsed=${walletUsed} client=${client} expected=${expected}`
      );
    }
    return expected;
  } catch (e) {
    console.warn(`[PRICE-AUDIT][${label}] skipped: ${e.message}`);
    return null;
  }
};

/** Max wallet points redeemable against a given price. */
const getMaxRedeemable = async (price) => {
  const s = await AppSettings.getSettings();
  return Math.floor((Number(price) || 0) * (s.pricing.walletRedeemCapPercent / 100));
};

module.exports = {
  getPublicSettings,
  getSettings,
  updateSettings,
  // helpers
  getMailEvent,
  calculateSubscriptionPrice,
  auditSubscriptionPrice,
  getMaxRedeemable,
};
