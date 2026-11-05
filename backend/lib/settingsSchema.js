/**
 * Validation for PUT /api/admin-ops/settings.
 *
 * validateSettingsPatch(body) → { ok, errors, flat } where `flat` maps dotted
 * paths to validated values (null = remove the override), ready for settingsStore.save().
 */
const { CHANNELS, EVENTS } = require("./notify/events");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// type: number | int | percent | bool | string | time | intArray | emailArray | channelsMap
const SCHEMA = {
  pricePerDayPerChild: { type: "number", min: 0 },
  "planDurations.oneMonth": { type: "int", min: 1 },
  "planDurations.threeMonths": { type: "int", min: 1 },
  "planDurations.sixMonths": { type: "int", min: 1 },
  "singleChildDiscounts.oneMonth": { type: "percent" },
  "singleChildDiscounts.threeMonths": { type: "percent" },
  "singleChildDiscounts.sixMonths": { type: "percent" },
  "multiChildDiscounts.oneMonth": { type: "percent" },
  "multiChildDiscounts.threeMonths": { type: "percent" },
  "multiChildDiscounts.sixMonths": { type: "percent" },
  multiChildThreshold: { type: "int", min: 1 },
  holidayMealPricePerChild: { type: "number", min: 0 },
  maxChildren: { type: "int", min: 1, max: 10 },
  walletMaxRedeemPercent: { type: "percent" },
  mealLockDaysAhead: { type: "int", min: 0, max: 30 },
  mealCutoffTime: { type: "time" },
  renewalReminderDays: { type: "intArray", min: 0, max: 90 },
  adminNotifyEmails: { type: "emailArray" },
  trialEnabled: { type: "bool" },
  trialPrice: { type: "number", min: 0 },
  tryOurMealEnabled: { type: "bool" },
  supportPhone: { type: "string", max: 40 },
  supportEmail: { type: "string", max: 120 },
  whatsappNumber: { type: "string", max: 20 },
  notificationChannels: { type: "channelsMap" },
};

const OBJECT_GROUPS = ["planDurations", "singleChildDiscounts", "multiChildDiscounts"];

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Flatten {planDurations:{oneMonth:20}} → {"planDurations.oneMonth":20}; other keys stay as-is. */
const flatten = (body) => {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (OBJECT_GROUPS.includes(k) && isPlainObject(v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    } else {
      out[k] = v;
    }
  }
  return out;
};

const checkValue = (path, rule, value) => {
  const bad = (msg) => ({ error: `${path}: ${msg}` });
  switch (rule.type) {
    case "number":
    case "int":
    case "percent": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) return bad("must be a number");
      if (rule.type === "int" && !Number.isInteger(n)) return bad("must be a whole number");
      const min = rule.type === "percent" ? 0 : rule.min;
      const max = rule.type === "percent" ? 100 : rule.max;
      if (min != null && n < min) return bad(`must be at least ${min}`);
      if (max != null && n > max) return bad(`must be at most ${max}`);
      return { value: n };
    }
    case "bool":
      if (typeof value === "boolean") return { value };
      if (value === "true" || value === "false") return { value: value === "true" };
      return bad("must be true or false");
    case "string":
      if (typeof value !== "string") return bad("must be a string");
      if (rule.max && value.length > rule.max) return bad(`must be at most ${rule.max} characters`);
      return { value: value.trim() };
    case "time":
      if (typeof value !== "string" || !TIME_RE.test(value)) return bad('must be "HH:MM" (24h)');
      return { value };
    case "intArray": {
      if (!Array.isArray(value) || value.length === 0) return bad("must be a non-empty array of numbers");
      const nums = value.map(Number);
      if (nums.some((n) => !Number.isInteger(n) || n < rule.min || n > rule.max))
        return bad(`every entry must be a whole number between ${rule.min} and ${rule.max}`);
      return { value: Array.from(new Set(nums)).sort((a, b) => b - a) };
    }
    case "emailArray": {
      const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
      if (!list) return bad("must be an array of emails");
      const emails = list.map((e) => String(e).trim()).filter(Boolean);
      const invalid = emails.filter((e) => !EMAIL_RE.test(e));
      if (invalid.length) return bad(`invalid email(s): ${invalid.join(", ")}`);
      return { value: emails };
    }
    case "channelsMap": {
      if (!isPlainObject(value)) return bad("must be an object of { eventType: [channels] }");
      const out = {};
      for (const [type, chans] of Object.entries(value)) {
        if (!EVENTS[type]) return bad(`unknown event type "${type}"`);
        if (!Array.isArray(chans) || chans.some((c) => !CHANNELS.includes(c)))
          return bad(`"${type}" channels must be among ${CHANNELS.join(", ")}`);
        out[type] = Array.from(new Set(chans));
      }
      return { value: out };
    }
    default:
      return bad("unsupported setting");
  }
};

const validateSettingsPatch = (body) => {
  const errors = [];
  const flat = {};
  if (!isPlainObject(body)) return { ok: false, errors: ["body must be an object"], flat };
  for (const [path, value] of Object.entries(flatten(body))) {
    const rule = SCHEMA[path];
    if (!rule) {
      errors.push(`${path}: unknown setting`);
      continue;
    }
    if (value === null) {
      flat[path] = null; // remove override
      continue;
    }
    const res = checkValue(path, rule, value);
    if (res.error) errors.push(res.error);
    else flat[path] = res.value;
  }
  if (!errors.length && Object.keys(flat).length === 0) errors.push("nothing to update");
  return { ok: errors.length === 0, errors, flat };
};

module.exports = { SCHEMA, validateSettingsPatch, flatten };
