const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

// ================= COMPANY DETAILS =================
const COMPANY = {
  name: "LUNCHBOWL",
  legalName: "BY EARTH TECH CONCEPTS PRIVATE LIMITED",
  address: "Saravana Street, T Nagar, Chennai - 600017",
  gstin: process.env.LUNCHBOWL_GSTIN || "NA",
  contact: process.env.LUNCHBOWL_CONTACT || "+91 9176 9176 02",
  email: process.env.LUNCHBOWL_EMAIL || "contactus@lunchbowl.co.in",
};

const M = 50;
const PAGE_WIDTH = 595; // A4 @ 72 DPI
const PAGE_HEIGHT = 842; // A4 @ 72 DPI

function formatINR(num) {
  const n = Number(num);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildInvoiceNumber(orderId, paymentType) {
  const year = new Date().getFullYear();
  const suffix =
    (orderId || String(Date.now()))
      .replace(/\D/g, "")
      .slice(-8) || String(Date.now()).slice(-8);

  const t = String(paymentType || "").toLowerCase();
  let typeCode = "C";

  if (t.includes("try") && t.includes("meal")) typeCode = "M";
  else if (t.includes("holiday")) typeCode = "H";
  else if (t.includes("renew")) typeCode = "R";
  else if (t.includes("subscription")) typeCode = "S";
  else if (t.includes("add") && t.includes("child")) typeCode = "C";

  return `INV-${typeCode}-${year}-${suffix}`;
}

async function generatePaymentInvoicePDF(options) {
  const {
    invoiceNumber,
    customerName,
    customerAddress,
    customerPhone,
    customerEmail,
    customerId,
    amount,
    paymentReason,
    reasonDetails = {},
    orderId,
    trackingId,
  } = options;

  const invoiceDate = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  const amt = Number(amount || 0);
  const subtotal = amt / 1.05; // amount includes GST(5%)
  const gst = amt - subtotal;

  return new Promise((resolve, reject) => {
    console.log("[Invoice] DEBUG PDF:build start", {
      invoiceNumber,
      orderId,
      amount: amt,
    });

    const doc = new PDFDocument({
      size: "A4",
      margin: M,
      autoFirstPage: true,
    });

    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const buf = Buffer.concat(buffers);
      console.log("[Invoice] DEBUG PDF:build end", {
        invoiceNumber,
        orderId,
        bytes: buf.length,
      });
      resolve(buf);
    });
    doc.on("error", (err) => {
      console.error("[Invoice] DEBUG PDF:stream error", {
        invoiceNumber,
        orderId,
        message: err && err.message,
      });
      reject(err);
    });

    // ================= HEADER =================
    // Portrait/tall logos must be bounded in both dimensions; fixed width alone
    // can make height huge and overlap the left column (looks like a broken invoice).
    const defaultLogoPath = path.join(__dirname, "..", "logo.png");
    const logoPath = process.env.INVOICE_LOGO_PATH || defaultLogoPath;
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, M, M, { fit: [85, 72], align: "left", valign: "top" });
      } catch (e) {
        console.error("Invoice logo embed failed (PDF still generated):", e.message);
      }
    }

    const rightX = 330;
    const rightWidth = PAGE_WIDTH - M - rightX;

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(COMPANY.name, rightX, M, { width: rightWidth, align: "right" });

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(COMPANY.legalName, rightX, doc.y, {
        width: rightWidth,
        align: "right",
      });

    doc.moveDown(0.3);
    doc.text(COMPANY.address, { width: rightWidth, align: "right" });
    doc.moveDown(0.3);
    doc.text(`GSTIN: ${COMPANY.gstin}`, { align: "right" });
    doc.text(`Contact No: ${COMPANY.contact}`, { align: "right" });
    doc.text(`Email: ${COMPANY.email}`, { align: "right" });

    doc.moveDown(2);

    // ================= CUSTOMER + INVOICE =================
    const topY = doc.y;

    // LEFT SIDE
    doc.font("Helvetica-Bold").fontSize(11).text("CUSTOMER DETAILS", M, topY);
    doc.font("Helvetica").fontSize(9);
    doc.moveDown(0.5);
    doc.text(customerName || "—");
    doc.text(customerAddress || "—", { width: 220 });
    doc.text(`Phone: ${customerPhone || "—"}`);
    doc.text(`Email: ${customerEmail || "—"}`);

    // RIGHT SIDE
    doc.font("Helvetica-Bold").fontSize(11).text("INVOICE", rightX, topY);
    doc.font("Helvetica").fontSize(9);
    doc.text(`Invoice #: ${invoiceNumber}`, rightX, doc.y);
    doc.text(`Invoice Date: ${invoiceDate}`, rightX);
    doc.text(`Invoice Amount: ₹${formatINR(amt)}`, rightX);

    if (customerId) {
      doc.text(`Customer ID: ${customerId}`, rightX);
    }

    doc.moveDown(2);

    // ================= BLACK BAR =================
    const barY = doc.y;
    doc.rect(M, barY, PAGE_WIDTH - 2 * M, 26).fill("#000");
    doc
      .fillColor("#fff")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("PAYMENT DETAILS", M + 10, barY + 8);
    doc.fillColor("#000");
    doc.moveDown(2);

    // ================= PAYMENT ROWS =================
    const labelX = M;
    const valueX = M + 220;

    const rows = [
      ["Payment For", paymentReason],
      ["Order ID", orderId],
      ["Transaction ID", trackingId || "LOCAL_TXN"],
      ["Number of Meals", reasonDetails["Number of Meals"]],
      ["Delivery Pincode", reasonDetails["Delivery Pincode"]],
    ];

    doc.font("Helvetica").fontSize(9);
    rows.forEach(([label, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        doc.text(label, labelX, doc.y);
        doc.text(String(value), valueX, doc.y, { width: 160 });
        doc.moveDown(1.0);
      }
    });

    doc.moveDown(0.5);

    // ================= SUMMARY =================
    const summaryLabelX = PAGE_WIDTH - 200;
    const summaryValueWidth = 110;

    doc.font("Helvetica").fontSize(9);
    doc.text("Subtotal", summaryLabelX);
    doc.text(
      "₹" + formatINR(subtotal),
      PAGE_WIDTH - M - summaryValueWidth,
      doc.y,
      { width: summaryValueWidth, align: "right" }
    );
    doc.moveDown(0.6);

    doc.text("GST (5%)", summaryLabelX);
    doc.text(
      "₹" + formatINR(gst),
      PAGE_WIDTH - M - summaryValueWidth,
      doc.y,
      { width: summaryValueWidth, align: "right" }
    );
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total", summaryLabelX);
    doc.text(
      "₹" + formatINR(amt),
      PAGE_WIDTH - M - summaryValueWidth,
      doc.y,
      { width: summaryValueWidth, align: "right" }
    );

    // ================= FOOTER =================
    doc.font("Helvetica").fontSize(8).fillColor("#666");
    doc.text(
      `You can contact us anytime at ${COMPANY.contact} or ${COMPANY.email}`,
      M,
      PAGE_HEIGHT - 40,
      {
        align: "center",
        width: PAGE_WIDTH - 2 * M,
      }
    );

    doc.end();
  });
}

module.exports = {
  generatePaymentInvoicePDF,
  buildInvoiceNumber,
  COMPANY,
};

