/**
 * Single source of truth for LunchBowl pricing and working-day rules.
 *
 * The website (store-without-stripe) hard-codes the same defaults; the mobile app
 * reads them from GET /api/app-config. Payment amounts are computed here so the
 * server never has to trust a price sent by a client.
 */

const settingsStore = require("./settingsStore");

const envNumber = (key, defaultValue) => {
  const val = process.env[key];
  if (val == null || val === "") return defaultValue;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const envBool = (key, defaultValue) => {
  const val = process.env[key];
  if (val == null || val === "") return defaultValue;
  return val === "true" || val === "1";
};

const envList = (key, defaultValue) => {
  const val = process.env[key];
  if (val == null || val.trim() === "") return defaultValue;
  return val.split(",").map((s) => s.trim()).filter(Boolean);
};

const envNumberList = (key, defaultValue) => {
  const list = envList(key, null);
  if (!list) return defaultValue;
  const nums = list.map(Number).filter((n) => !Number.isNaN(n));
  return nums.length ? nums : defaultValue;
};

/** Hard-coded defaults overridden by .env — before the database overrides are applied. */
const getEnvPricingConfig = () => ({
  pricePerDayPerChild: envNumber("PRICE_PER_DAY_PER_CHILD", 225),
  planDurations: {
    oneMonth: envNumber("PLAN_DAYS_1_MONTH", 22),
    threeMonths: envNumber("PLAN_DAYS_3_MONTHS", 66),
    sixMonths: envNumber("PLAN_DAYS_6_MONTHS", 132),
  },
  singleChildDiscounts: {
    oneMonth: envNumber("DISCOUNT_SINGLE_1M", 0),
    threeMonths: envNumber("DISCOUNT_SINGLE_3M", 5),
    sixMonths: envNumber("DISCOUNT_SINGLE_6M", 10),
  },
  multiChildDiscounts: {
    oneMonth: envNumber("DISCOUNT_MULTI_1M", 5),
    threeMonths: envNumber("DISCOUNT_MULTI_3M", 15),
    sixMonths: envNumber("DISCOUNT_MULTI_6M", 20),
  },
  multiChildThreshold: envNumber("MULTI_CHILD_THRESHOLD", 2),
  holidayMealPricePerChild: envNumber("HOLIDAY_MEAL_PRICE_PER_CHILD", 225),
  maxChildren: envNumber("MAX_CHILDREN", 3),
  walletMaxRedeemPercent: envNumber("WALLET_MAX_REDEEM_PERCENT", 80),

  // ── Ordering rules ───────────────────────────────────────────────────────────
  // Meals can be changed or deleted only for dates after today (IST).
  mealLockDaysAhead: envNumber("MEAL_LOCK_DAYS_AHEAD", 1),
  // Informational for now: last time of day (IST, "HH:MM") to add/change tomorrow's meal.
  mealCutoffTime: process.env.MEAL_CUTOFF_TIME || "21:00",

  // ── Reminders & admin alerts ─────────────────────────────────────────────────
  renewalReminderDays: envNumberList("RENEWAL_REMINDER_DAYS", [7, 3, 1]),
  adminNotifyEmails: envList("ADMIN_NOTIFY_EMAILS", ["kavirajan@opendesignsin.com"]),

  // ── Trial / try-our-meal switches ────────────────────────────────────────────
  trialEnabled: envBool("ENABLE_TRIAL", false),
  trialPrice: envNumber("TRIAL_PRICE", 99),
  tryOurMealEnabled: envBool("TRY_OUR_MEAL_ENABLED", false),

  // ── Support ──────────────────────────────────────────────────────────────────
  supportPhone: process.env.SUPPORT_PHONE || "+91 91769 17602",
  supportEmail: process.env.SUPPORT_EMAIL || "contactus@lunchbowl.co.in",
  whatsappNumber: process.env.WHATSAPP_NUMBER || "919345407191",
});

/**
 * Effective config: hard-coded defaults ← .env ← database overrides (admin dashboard).
 * Synchronous: the overrides come from the settingsStore cache.
 */
const getPricingConfig = () => settingsStore.deepMerge(getEnvPricingConfig(), settingsStore.getAll());

/** Discount (%) for a plan of `workingDays` days and `childCount` children; 0 for non-standard lengths. */
const discountPercentFor = (workingDays, childCount, cfg = getPricingConfig()) => {
  const tiers =
    childCount >= cfg.multiChildThreshold ? cfg.multiChildDiscounts : cfg.singleChildDiscounts;
  const { oneMonth, threeMonths, sixMonths } = cfg.planDurations;
  if (workingDays === oneMonth) return tiers.oneMonth;
  if (workingDays === threeMonths) return tiers.threeMonths;
  if (workingDays === sixMonths) return tiers.sixMonths;
  return 0;
};

/** Same formula as the website's plan step: round(days × price × (1 − discount) × children). */
const computePlanPrice = (workingDays, childCount, cfg = getPricingConfig()) => {
  const discount = discountPercentFor(workingDays, childCount, cfg) / 100;
  return Math.round(workingDays * cfg.pricePerDayPerChild * (1 - discount) * childCount);
};

/** Maximum wallet points that may be redeemed against a plan of `planPrice`. */
const maxWalletRedeem = (planPrice, walletPoints, cfg = getPricingConfig()) =>
  Math.max(0, Math.min(Number(walletPoints) || 0, (planPrice * cfg.walletMaxRedeemPercent) / 100));

// ── Dates ──────────────────────────────────────────────────────────────────────
// All business dates are Indian calendar days, represented as "YYYY-MM-DD".

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for an IST calendar day. Plain "YYYY-MM-DD" strings are returned unchanged. */
const toDateKey = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Dates stored at UTC midnight (holidays, plan dates) map to their own calendar day.
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d.toISOString().slice(0, 10);
  }
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

const todayKeyIST = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const addDaysKey = (key, days) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 0 = Sunday … 6 = Saturday */
const dayOfWeekKey = (key) => new Date(`${key}T00:00:00Z`).getUTCDay();

/** Working days are Monday–Friday, excluding admin holidays (same rule as the website). */
const isWorkingDayKey = (key, holidayKeys) => {
  const dow = dayOfWeekKey(key);
  return dow !== 0 && dow !== 6 && !holidayKeys.has(key);
};

const countWorkingDays = (fromKey, toKey, holidayKeys) => {
  let count = 0;
  for (let k = fromKey; k <= toKey; k = addDaysKey(k, 1)) {
    if (isWorkingDayKey(k, holidayKeys)) count++;
  }
  return count;
};

const nextWorkingDayKey = (fromKey, holidayKeys) => {
  let k = fromKey;
  while (!isWorkingDayKey(k, holidayKeys)) k = addDaysKey(k, 1);
  return k;
};

/** Set of "YYYY-MM-DD" holiday keys from Holiday documents. */
const holidayKeySet = (holidays) =>
  new Set((holidays || []).map((h) => toDateKey(h.date)).filter(Boolean));

module.exports = {
  envNumber,
  envBool,
  envList,
  getEnvPricingConfig,
  getPricingConfig,
  discountPercentFor,
  computePlanPrice,
  maxWalletRedeem,
  toDateKey,
  todayKeyIST,
  addDaysKey,
  dayOfWeekKey,
  isWorkingDayKey,
  countWorkingDays,
  nextWorkingDayKey,
  holidayKeySet,
};
