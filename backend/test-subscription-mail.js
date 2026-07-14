// End-to-end test of the subscription invoice email (PDF + SMTP).
// Run from the backend folder:
//    node test-subscription-mail.js you@example.com
// If no recipient is given, it sends to EMAIL_USER (yourself).
// This mirrors sendPaymentInvoiceEmail() used by the renewal/new-subscription flows.
// Delete this file once you've confirmed mail works.
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/.env.local`, override: true });
const nodemailer = require("nodemailer");
const { generatePaymentInvoicePDF, buildInvoiceNumber } = require("./lib/payment-invoice-pdf");

const toEmail = process.argv[2] || process.env.EMAIL_USER;

(async () => {
  console.log("Recipient:", toEmail);
  console.log("SMTP user:", process.env.EMAIL_USER, "| host:", process.env.HOST || "(service:gmail)");
  if (!toEmail) return console.log("❌ No recipient and EMAIL_USER not set.");

  try {
    const orderId = "RENEWTEST" + Date.now();
    const invoiceNumber = buildInvoiceNumber(orderId, "Plan Renewal");

    console.log("Generating invoice PDF...");
    const pdfBuffer = await generatePaymentInvoicePDF({
      invoiceNumber,
      customerName: "Test Customer",
      customerAddress: "Test Address, Chennai",
      customerPhone: "9999999999",
      customerEmail: toEmail,
      customerId: "000000000000000000000000",
      amount: 2500,
      paymentReason: "Plan Renewal",
      reasonDetails: { "Billing Period": "01/01/2026 to 31/01/2026", "Subscription ID": "TEST" },
      orderId,
      trackingId: "LOCAL_TEST_TXN",
    });
    console.log("PDF generated:", pdfBuffer.length, "bytes");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    console.log("Sending...");
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `TEST Subscription Invoice – ${invoiceNumber}`,
      html: `<p>This is a test of the subscription invoice email.</p><p>Invoice #: <b>${invoiceNumber}</b></p>`,
      attachments: [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdfBuffer }],
    });

    console.log("\n✅ SENT. messageId:", info.messageId);
    console.log("Check the recipient inbox (and spam). If this arrives, the subscription");
    console.log("mail machinery works — any missing mail in the real flow is a code-path");
    console.log("issue (e.g. form.save validation), not SMTP.");
  } catch (e) {
    console.log("\n❌ FAILED:", e.name, "-", e.message);
    if (e.stack) console.log(e.stack.split("\n").slice(0, 4).join("\n"));
  }
})();
