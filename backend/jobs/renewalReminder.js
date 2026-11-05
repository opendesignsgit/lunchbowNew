/**
 * Renewal reminders.
 *
 * runRenewalReminders(): for every N in settings.renewalReminderDays (default 7, 3, 1)
 * find active subscriptions ending exactly N days from today (IST) whose user has
 * no upcoming/pending plan, and send an email + SMS (template SUBSCRIPTION_RENEWAL).
 * Each delivery is recorded in ReminderLog so a re-run never sends twice.
 *
 * Scheduled by jobs/scheduler.js (RENEWAL_REMINDER_CRON, default 09:00 IST).
 */
const ReminderLog = require("../models/ReminderLog");
const SmsLog = require("../models/SmsLog");
const { getPricingConfig, toDateKey } = require("../lib/pricing");
const { sendSMS } = require("../lib/sms-sender/smsService");
const { sendMail, escapeHtml } = require("../lib/notify/email");
const { notifyAdmin } = require("../lib/notify");
const { findExpiringSubscriptions } = require("../controller/adminOps/renewals");

const RENEW_URL = "https://lunchbowl.co.in/user/userDashBoard";

const formatDate = (key) => {
  const [y, m, d] = String(key).split("-");
  return `${d}/${m}/${y}`;
};

const childNames = (sub) =>
  (sub.children || [])
    .map((c) => (c && c.childFirstName ? `${c.childFirstName} ${c.childLastName || ""}`.trim() : null))
    .filter(Boolean)
    .join(", ") || "your child";

const renewalEmail = ({ parentName, endKey, sub }) => ({
  subject: "Renewal Reminder – Keep the Lunches Coming!",
  html: `
    <p>Hi ${escapeHtml(parentName || "Parent")},</p>
    <p>Your Lunch Bowl subscription is due to expire on <strong>${formatDate(endKey)}</strong>.</p>
    <p>To ensure ${escapeHtml(childNames(sub))} continues receiving healthy meals, kindly renew before the deadline.</p>
    <p>👉 <a href="${RENEW_URL}">Renew My Subscription Now</a></p>
    <p>We're here to keep the lunchbox full and the child smiling!</p>
    <p>– Team Lunch Bowl</p>
  `,
});

const alreadySent = async (sub, daysBefore, channel) =>
  Boolean(await ReminderLog.exists({ subscriptionId: sub._id, kind: "renewal", daysBefore, channel }));

const logSent = (sub, daysBefore, channel) =>
  ReminderLog.create({ subscriptionId: sub._id, userId: sub.user, kind: "renewal", daysBefore, channel });

const runRenewalReminders = async ({ days } = {}) => {
  const cfg = getPricingConfig();
  const dayList = Array.isArray(days) && days.length ? days : cfg.renewalReminderDays || [7, 3, 1];
  const summary = { checked: 0, emails: 0, sms: 0, skipped: 0, errors: 0, days: dayList };

  for (const n of dayList) {
    const subs = await findExpiringSubscriptions({ exactDay: Number(n) });
    for (const sub of subs) {
      summary.checked++;
      const endKey = toDateKey(sub.endDate);
      const parentName = sub.parent.name || "Parent";
      const sent = [];
      try {
        if (sub.parent.email && !(await alreadySent(sub, n, "email"))) {
          const ok = await sendMail({ to: sub.parent.email, ...renewalEmail({ parentName, endKey, sub }) });
          if (ok) {
            await logSent(sub, n, "email");
            summary.emails++;
            sent.push("email");
          }
        } else if (sub.parent.email) summary.skipped++;

        if (sub.parent.phone && !(await alreadySent(sub, n, "sms"))) {
          const variables = [parentName, formatDate(endKey)];
          const smsResult = (await sendSMS(sub.parent.phone, "SUBSCRIPTION_RENEWAL", variables)) || {};
          try {
            await new SmsLog({
              mobile: sub.parent.phone,
              messageType: "SUBSCRIPTION_RENEWAL",
              message: smsResult.message || "",
              templateId: smsResult.templateId || "",
              messageId: smsResult.messageId != null ? String(smsResult.messageId) : "",
              status: smsResult.success ? "sent" : "failed",
              error: smsResult.error || undefined,
              customerId: sub.user,
              variables,
              sentAt: new Date(),
            }).save();
          } catch (logErr) {
            console.error("[renewalReminder] SmsLog save failed:", logErr && logErr.message);
          }
          if (smsResult.success) {
            await logSent(sub, n, "sms");
            summary.sms++;
            sent.push("sms");
          }
        } else if (sub.parent.phone) summary.skipped++;

        if (sent.length) {
          notifyAdmin({
            type: "reminder.renewal.sent",
            title: `Renewal reminder sent (${n} day${n === 1 ? "" : "s"} left)`,
            message: `${parentName} (${sub.parent.phone || sub.parent.email}) — plan ends ${formatDate(endKey)}; sent via ${sent.join(" + ")}`,
            userId: sub.user,
            meta: { subscriptionId: String(sub._id), daysBefore: n, channels: sent, endDate: endKey },
          });
        }
      } catch (err) {
        summary.errors++;
        console.error("[renewalReminder] failed for subscription", String(sub._id), err && err.message);
      }
    }
  }
  console.log("[renewalReminder]", JSON.stringify(summary));
  return summary;
};

module.exports = { runRenewalReminders, renewalEmail, formatDate };
