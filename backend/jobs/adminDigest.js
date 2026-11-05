/**
 * Daily digest email: one mail listing every info/warning notification that has not
 * been emailed yet, then marks them emailed. Cron: ADMIN_DIGEST_CRON (default 19:00 IST).
 */
const AdminNotification = require("../models/AdminNotification");
const settingsStore = require("../lib/settingsStore");
const { adminEmails } = require("../lib/notify/events");
const { sendMail, escapeHtml } = require("../lib/notify/email");

const MAX_ROWS = 500;

const fmtTime = (d) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });

const buildDigest = (rows) => {
  const byType = rows.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `<li>${escapeHtml(t)}: <strong>${c}</strong></li>`)
    .join("");
  const list = rows
    .map(
      (n) =>
        `<tr>
          <td style="white-space:nowrap;color:#666">${fmtTime(n.createdAt)}</td>
          <td>${n.severity === "warning" ? "⚠️ " : ""}${escapeHtml(n.title)}</td>
          <td>${escapeHtml(n.message || "")}</td>
        </tr>`
    )
    .join("");
  return {
    subject: `[LunchBowl] Daily digest — ${rows.length} notification${rows.length === 1 ? "" : "s"}`,
    html: `
      <h3>LunchBowl daily digest</h3>
      <ul>${summary}</ul>
      <table cellpadding="4" style="border-collapse:collapse;font-size:13px">
        <tr><th align="left">Time (IST)</th><th align="left">Event</th><th align="left">Details</th></tr>
        ${list}
      </table>
      <p style="color:#888;font-size:12px">Open the admin dashboard for the full list.</p>
    `,
  };
};

const runAdminDigest = async () => {
  const rows = await AdminNotification.find({ emailed: false, severity: { $in: ["info", "warning"] } })
    .sort({ createdAt: 1 })
    .limit(MAX_ROWS)
    .lean();
  if (rows.length === 0) {
    console.log("[adminDigest] nothing to send");
    return { sent: false, count: 0 };
  }
  const to = adminEmails(settingsStore.get("adminNotifyEmails"));
  const ok = await sendMail({ to, ...buildDigest(rows) });
  if (ok) {
    await AdminNotification.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { emailed: true } });
  }
  console.log(`[adminDigest] ${ok ? "sent" : "FAILED"} ${rows.length} notification(s) to ${to.join(", ")}`);
  return { sent: ok, count: rows.length, to };
};

module.exports = { runAdminDigest, buildDigest };
