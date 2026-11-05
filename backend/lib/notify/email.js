/**
 * Plain HTML mail helper used by admin alerts, digests and reminder jobs.
 * Uses the same Gmail transport as the rest of the backend (EMAIL_USER / EMAIL_PASS).
 * Never throws: returns true when the mail was handed to the transport, else false.
 */
const nodemailer = require("nodemailer");

let warnedMissingConfig = false;

const escapeHtml = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const sendMail = async ({ to, subject, html, text }) => {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : to;
  if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) return false;
  if (!process.env.EMAIL_USER) {
    if (!warnedMissingConfig) {
      console.warn("[notify/email] EMAIL_USER not configured — emails are skipped");
      warnedMissingConfig = true;
    }
    return false;
  }
  try {
    const transporter = createTransporter();
    await new Promise((resolve, reject) => {
      const result = transporter.sendMail(
        { from: process.env.EMAIL_USER, to: recipients, subject, html, text },
        (err, info) => (err ? reject(err) : resolve(info))
      );
      // Some transports (and test stubs) return a promise instead of using the callback.
      if (result && typeof result.then === "function") result.then(resolve, reject);
    });
    return true;
  } catch (err) {
    console.error("[notify/email] send failed:", err && err.message);
    return false;
  }
};

/** Simple key/value table used by alert mails. */
const detailsTable = (rows) =>
  `<table cellpadding="4" style="border-collapse:collapse">${Object.entries(rows || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="color:#666"><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(
          typeof v === "object" ? JSON.stringify(v) : v
        )}</td></tr>`
    )
    .join("")}</table>`;

module.exports = { sendMail, escapeHtml, detailsTable };
