/**
 * Customer and admin emails sent when a payment settles. Every function here logs
 * failures and never throws: an email problem must not undo a settlement.
 */
const nodemailer = require("nodemailer");
const { generatePaymentInvoicePDF, buildInvoiceNumber } = require("../payment-invoice-pdf");

/** Receives a copy of every payment invoice PDF (override via env). */
const INVOICE_COPY_EMAIL = process.env.INVOICE_COPY_EMAIL || "csivarex.odi@gmail.com";

const adminRecipients = () =>
  (process.env.ADMIN_NOTIFY_EMAILS || "kavirajan@opendesignsin.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Safe for logs. */
function maskEmail(email) {
  if (!email || typeof email !== "string") return "(none)";
  const t = email.trim();
  const at = t.indexOf("@");
  if (at < 1) return "(invalid)";
  return `${t.slice(0, 2)}***${t.slice(at)}`;
}

const transport = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const mailConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

/** Plain HTML email; resolves to true when sent. */
async function sendMail({ to, bcc, subject, html, attachments }) {
  if (!mailConfigured()) {
    console.warn("[mail] skipped (EMAIL_USER/EMAIL_PASS missing):", subject);
    return false;
  }
  if (!to) return false;
  try {
    await transport().sendMail({
      from: process.env.EMAIL_USER,
      to,
      ...(bcc ? { bcc } : {}),
      subject,
      html,
      ...(attachments ? { attachments } : {}),
    });
    return true;
  } catch (err) {
    const resp = String((err && err.response) || (err && err.message) || "");
    if (resp.includes("Daily user sending limit") || resp.includes("5.4.5")) {
      console.error(
        "[mail] Gmail daily sending limit exceeded for EMAIL_USER; consider a transactional provider."
      );
    }
    console.error("[mail] send failed:", subject, err && err.message);
    return false;
  }
}

/**
 * Sends the invoice PDF to the customer with a copy to INVOICE_COPY_EMAIL.
 */
async function sendPaymentInvoiceEmail({
  toEmail,
  customerName,
  customerAddress,
  customerPhone,
  customerId,
  amount,
  paymentReason,
  reasonDetails = {},
  orderId,
  trackingId,
}) {
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    console.warn("[Invoice] skipped: invalid amount", { amount, orderId, paymentReason });
    return;
  }
  if (!mailConfigured()) {
    console.error("[Invoice] skipped: EMAIL_USER or EMAIL_PASS missing");
    return;
  }

  const customerAddr = isValidEmail(toEmail) ? toEmail.trim() : null;
  const copyAddr = INVOICE_COPY_EMAIL.trim();
  const sameAsCopy = customerAddr && customerAddr.toLowerCase() === copyAddr.toLowerCase();
  const to = customerAddr && !sameAsCopy ? customerAddr : copyAddr;
  const bcc = customerAddr && !sameAsCopy ? copyAddr : undefined;

  try {
    const invoiceNumber = buildInvoiceNumber(orderId, paymentReason);
    const pdfBuffer = await generatePaymentInvoicePDF({
      invoiceNumber,
      customerName: customerName || "Customer",
      customerAddress: customerAddress || "",
      customerPhone: customerPhone || "",
      customerEmail: customerAddr || copyAddr,
      customerId: customerId ? String(customerId) : "",
      amount: amt,
      paymentReason: paymentReason || "Payment",
      reasonDetails,
      orderId,
      trackingId,
    });
    const sent = await sendMail({
      to,
      bcc,
      subject: `Your LunchBowl Invoice – ${invoiceNumber}`,
      html: `
        <p>Hi ${customerName || "Customer"},</p>
        <p>Thank you for your payment. Please find your invoice attached as a PDF.</p>
        <p>Invoice #: <strong>${invoiceNumber}</strong></p>
        <p>Amount: ₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
        <p>– Team LunchBowl </p>
      `,
      attachments: [{ filename: `LunchBowl-Invoice-${invoiceNumber}.pdf`, content: pdfBuffer }],
    });
    if (sent) console.log("[Invoice] sent", { invoiceNumber, orderId, to: maskEmail(to) });
  } catch (err) {
    console.error("[Invoice] failed", { orderId, message: err && err.message });
  }
}

/** Legacy-style admin email for a settled payment (ADMIN_NOTIFY_EMAILS). */
async function sendSubscriptionAdminEmail({ type, customerName, customerEmail, amount, orderId, trackingId }) {
  const to = adminRecipients().join(",");
  if (!to) return;
  const sent = await sendMail({
    to,
    subject: `${type} – ${customerName || "Customer"} (${orderId || "N/A"})`,
    html: `
      <p>A subscription payment was completed.</p>
      <p><strong>Type:</strong> ${type}</p>
      <p><strong>Customer:</strong> ${customerName || "—"}</p>
      <p><strong>Email:</strong> ${customerEmail || "—"}</p>
      <p><strong>Amount:</strong> ₹${amount || 0}</p>
      <p><strong>Order ID:</strong> ${orderId || "—"}</p>
      <p><strong>Transaction ID:</strong> ${trackingId || "—"}</p>
    `,
  });
  if (sent) console.log("📧 Admin email sent:", orderId);
}

module.exports = {
  INVOICE_COPY_EMAIL,
  adminRecipients,
  isValidEmail,
  maskEmail,
  sendMail,
  sendPaymentInvoiceEmail,
  sendSubscriptionAdminEmail,
};
