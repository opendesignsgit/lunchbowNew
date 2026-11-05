/**
 * notifyAdmin(event) implementation (entry point: lib/notify/index.js).
 *
 * 1. Stores an AdminNotification (the dashboard bell reads these).
 * 2. Routes it by channel (see events.js): email immediately, push to admin
 *    devices, or leave it for the daily digest (jobs/adminDigest.js).
 */
const AdminNotification = require("../../models/AdminNotification");
const settingsStore = require("../settingsStore");
const { EVENTS, normalizeSeverity, channelsFor, adminEmails } = require("./events");
const { sendMail, escapeHtml, detailsTable } = require("./email");
const push = require("./push");

const SEVERITY_LABEL = { info: "Info", warning: "Warning", critical: "CRITICAL" };

const buildEmail = (doc) => {
  const label = SEVERITY_LABEL[doc.severity] || doc.severity;
  const subject = `[LunchBowl ${label}] ${doc.title}`;
  const html = `
    <h3>${escapeHtml(doc.title)}</h3>
    <p>${escapeHtml(doc.message || "")}</p>
    ${detailsTable({
      Type: doc.type,
      Severity: doc.severity,
      Customer: doc.userId ? String(doc.userId) : "",
      Time: new Date(doc.createdAt || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      ...(doc.meta && typeof doc.meta === "object" ? doc.meta : {}),
    })}
    <p style="color:#888;font-size:12px">Sent by the LunchBowl admin notification bus.</p>
  `;
  return { subject, html };
};

const notifyAdmin = async (event) => {
  if (!event || !event.type) return null;
  const def = EVENTS[event.type] || {};
  const severity = normalizeSeverity(event.type, event.severity);
  const channels = channelsFor(event.type, severity, settingsStore.get("notificationChannels"));

  const doc = await AdminNotification.create({
    type: event.type,
    severity,
    title: event.title || def.title || event.type,
    message: event.message || "",
    userId: event.userId || undefined,
    meta: event.meta && typeof event.meta === "object" ? event.meta : {},
    channels,
  });

  const tasks = [];
  if (channels.includes("email")) {
    const { subject, html } = buildEmail(doc);
    tasks.push(
      sendMail({ to: adminEmails(settingsStore.get("adminNotifyEmails")), subject, html }).then((ok) =>
        ok ? AdminNotification.updateOne({ _id: doc._id }, { $set: { emailed: true } }) : null
      )
    );
  }
  if (channels.includes("push")) {
    tasks.push(
      push
        .sendToAdmins({
          title: doc.title,
          body: doc.message,
          data: { type: doc.type, severity, notificationId: String(doc._id), userId: doc.userId ? String(doc.userId) : "" },
        })
        .then((sent) => (sent > 0 ? AdminNotification.updateOne({ _id: doc._id }, { $set: { pushed: true } }) : null))
    );
  }
  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === "rejected") console.error("[notifyAdmin] channel failed:", r.reason && r.reason.message);
  });
  return doc;
};

module.exports = { notifyAdmin, buildEmail };
