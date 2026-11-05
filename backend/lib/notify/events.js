/**
 * Catalogue of admin notification events.
 *
 * Each event has a default severity; the severity decides the channels:
 *   critical → dashboard + email immediately + push
 *   warning  → dashboard + push + digest email
 *   info     → dashboard + digest email
 *
 * Admins can override channels per event type from the dashboard
 * (BusinessSetting.values.notificationChannels = { "payment.failed": ["email","push"] }).
 */
const SEVERITIES = ["info", "warning", "critical"];
const CHANNELS = ["dashboard", "email", "push", "digest"];

const SEVERITY_CHANNELS = {
  critical: ["dashboard", "email", "push"],
  warning: ["dashboard", "push", "digest"],
  info: ["dashboard", "digest"],
};

const EVENTS = {
  "user.signup": { severity: "info", title: "New signup" },
  "registration.step": { severity: "info", title: "Registration step saved" },
  "plan.selected": { severity: "info", title: "Plan selected" },
  "payment.success": { severity: "info", title: "Payment received" },
  "payment.failed": { severity: "warning", title: "Payment failed" },
  "payment.mismatch": { severity: "critical", title: "Payment amount mismatch" },
  "payment.unreconciled": { severity: "critical", title: "Payment not reconciled" },
  "renewal.paid": { severity: "info", title: "Renewal paid" },
  "child.added": { severity: "info", title: "Child added" },
  "meal.updated": { severity: "info", title: "Meals updated" },
  "meal.deleted": { severity: "info", title: "Meal deleted" },
  "holiday.booked": { severity: "info", title: "Holiday meal booked" },
  "school.requested": { severity: "warning", title: "New school requested" },
  "trial.enquiry": { severity: "warning", title: "Trial meal enquiry" },
  "enquiry.contact": { severity: "info", title: "Website enquiry" },
  "account.deleted": { severity: "warning", title: "Account deleted" },
  "admin.override": { severity: "info", title: "Admin override" },
  "reminder.renewal.sent": { severity: "info", title: "Renewal reminder sent" },
  "reminder.meal.sent": { severity: "info", title: "Meal reminder sent" },
  "job.error": { severity: "critical", title: "Background job failed" },
};

const DEFAULT_ADMIN_EMAIL = "kavirajan@opendesignsin.com";

const normalizeSeverity = (type, severity) => {
  if (SEVERITIES.includes(severity)) return severity;
  const def = EVENTS[type];
  return (def && def.severity) || "info";
};

/**
 * Channels for an event: override map (settings) → severity default.
 * "dashboard" is always included so nothing silently disappears.
 */
const channelsFor = (type, severity, overrides) => {
  let channels = null;
  if (overrides && typeof overrides === "object" && Array.isArray(overrides[type])) {
    channels = overrides[type].filter((c) => CHANNELS.includes(c));
  }
  if (!channels) channels = SEVERITY_CHANNELS[normalizeSeverity(type, severity)] || SEVERITY_CHANNELS.info;
  const set = new Set(channels);
  set.add("dashboard");
  return Array.from(set);
};

/** Admin recipients: settings value → ADMIN_NOTIFY_EMAILS env (as controller/Payment.js) → default. */
const adminEmails = (settingsValue) => {
  const fromSettings = Array.isArray(settingsValue)
    ? settingsValue
    : typeof settingsValue === "string"
    ? settingsValue.split(",")
    : null;
  const list = (fromSettings && fromSettings.length ? fromSettings : null) ||
    (process.env.ADMIN_NOTIFY_EMAILS || DEFAULT_ADMIN_EMAIL).split(",");
  return list.map((e) => String(e).trim()).filter(Boolean);
};

module.exports = {
  EVENTS,
  SEVERITIES,
  CHANNELS,
  SEVERITY_CHANNELS,
  DEFAULT_ADMIN_EMAIL,
  normalizeSeverity,
  channelsFor,
  adminEmails,
};
