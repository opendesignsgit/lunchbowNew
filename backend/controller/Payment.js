const qs = require("querystring");
const ccav = require("../utils/ccavutil");
const mongoose = require("mongoose"); // Add this import for ObjectId validation
const Form = require("../models/Form");
const UserPayment = require("../models/Payment");
const nodemailer = require("nodemailer");
const { sendSMS } = require("../lib/sms-sender/smsService");
const SmsLog = require("../models/SmsLog");
const HolidayPayment = require("../models/HolidayPayment");
const UserMeal = require("../models/UserMeal");
const Child = require("../models/childModel");
// const Form = require("../models/Form");
const Subscription = require("../models/subscriptionModel");
const {
  generatePaymentInvoicePDF,
  buildInvoiceNumber,
} = require("../lib/payment-invoice-pdf");

const PaymentIntent = require("../models/PaymentIntent");
const { getCcavConfig, getApiPublicUrl } = require("../lib/ccavenue");
const { getPricingConfig } = require("../lib/pricing");

const workingKey = getCcavConfig().workingKey;

/**
 * Looks up the server-created PaymentIntent for a CCAvenue response (app payments).
 * Web payments have no intent and keep their existing behaviour.
 *
 * Returns { intent, replay, mismatch }:
 *  - replay: the order was already settled; do not apply it again.
 *  - mismatch: the amount charged or the user differs from what the server priced.
 */
async function loadPaymentIntent(responseData) {
  const intent = await PaymentIntent.findOne({ orderId: responseData.order_id });
  if (!intent) return { intent: null, replay: false, mismatch: false };
  if (intent.status !== "created") return { intent, replay: true, mismatch: false };

  const charged = Number(responseData.amount);
  const userMatches = String(responseData.merchant_param1) === String(intent.user);
  if (
    responseData.order_status === "Success" &&
    (!userMatches || !Number.isFinite(charged) || Math.abs(charged - intent.amount) > 0.01)
  ) {
    intent.status = "amount_mismatch";
    intent.trackingId = responseData.tracking_id;
    intent.completedAt = new Date();
    await intent.save();
    console.error("[PAYMENT MISMATCH] CCAvenue response does not match the priced order", {
      order_id: responseData.order_id,
      expected: intent.amount,
      charged: responseData.amount,
      userMatches,
    });
    await sendSubscriptionAdminEmail({
      type: "PAYMENT MISMATCH - amount or user differs from the priced order (not applied)",
      customerName: String(intent.user),
      customerEmail: "",
      amount: responseData.amount,
      orderId: responseData.order_id,
      trackingId: responseData.tracking_id,
    });
    return { intent, replay: false, mismatch: true };
  }
  return { intent, replay: false, mismatch: false };
}

async function settlePaymentIntent(intent, success, trackingId) {
  if (!intent || intent.status !== "created") return;
  intent.status = success ? "success" : "failed";
  intent.trackingId = trackingId;
  intent.completedAt = new Date();
  await intent.save();
}

/** App payments return to the in-app result URL; web payments keep their website redirect. */
function redirectAfterPayment(req, res, intent, success, webUrl) {
  if (intent && intent.source === "app") {
    const status = success ? "success" : "failed";
    return res.redirect(
      `${getApiPublicUrl(req)}/api/ccavenue/app-result?status=${status}&type=${intent.type}&orderId=${encodeURIComponent(intent.orderId)}`
    );
  }
  return res.redirect(webUrl);
}

/** Receives a copy of every payment invoice PDF (override via env). */
const INVOICE_COPY_EMAIL =
  process.env.INVOICE_COPY_EMAIL || "csivarex.odi@gmail.com";

function isValidInvoiceEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Safe for logs (never log full passwords). */
function maskEmailForLog(email) {
  if (!email || typeof email !== "string") return "(none)";
  const t = email.trim();
  const at = t.indexOf("@");
  if (at < 1) return "(invalid)";
  return `${t.slice(0, 2)}***${t.slice(at)}`;
}

function logInvoiceDebug(source, payload) {
  console.log(`[Invoice] DEBUG ${source}`, {
    ts: new Date().toISOString(),
    ...payload,
  });
}

// Helper function to process payment response and save payment data
async function processPaymentResponse(responseData, paymentType, paidFor = null) {
  const {
    order_id,
    tracking_id,
    order_status,
    merchant_param1,
    merchant_param2,
    amount,
    payment_mode,
    card_name,
    status_code,
    status_message,
    bank_ref_no,
    billing_name,
    billing_email,
  } = responseData;

  if (!merchant_param1 || !order_id) {
    throw new Error(
      "Invalid payment response: missing merchant_param1 (user) or order_id"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(merchant_param1)) {
    throw new Error(`Invalid user ID (merchant_param1): ${merchant_param1}`);
  }

  // Build payment transaction object
  const paymentTransaction = {
    order_id,
    tracking_id,
    amount: parseFloat(amount || 0),
    order_status,
    payment_mode,
    card_name,
    status_code,
    status_message,
    bank_ref_no,
    billing_name,
    billing_email,
    payment_type: paymentType,
    merchant_param1,
    paidFor,
    // Include holidayDate if holiday payment
    ...(paymentType === "holiday" && merchant_param2
      ? { holidayDate: merchant_param2 }
      : {}),
    ...responseData,
  };

  // Update or create user payment record
  const updatedPayment = await UserPayment.findOneAndUpdate(
    { user: merchant_param1 },
    {
      $push: { payments: paymentTransaction },
      $inc: { total_amount: parseFloat(amount || 0) },
      $setOnInsert: { created_at: new Date() },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );

  return { order_status, merchant_param1, order_id, tracking_id };
}

/**
 * Sends a payment invoice PDF email to the customer (and a copy to INVOICE_COPY_EMAIL).
 * Does not throw; logs failures. Requires EMAIL_USER + EMAIL_PASS (Gmail app password).
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
  logInvoiceDebug("sendPaymentInvoiceEmail:enter", {
    paymentReason,
    orderId,
    trackingId,
    amountRaw: amount,
    amountType: typeof amount,
    toEmailRaw: maskEmailForLog(toEmail),
    customerId: customerId ? String(customerId) : null,
    hasEMAIL_USER: !!process.env.EMAIL_USER,
    hasEMAIL_PASS: !!process.env.EMAIL_PASS,
    senderMasked: maskEmailForLog(process.env.EMAIL_USER),
    copyEmail: INVOICE_COPY_EMAIL,
    nodeEnv: process.env.NODE_ENV || "(unset)",
  });

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0) {
    console.warn("[Invoice] skipped: invalid amount", {
      amount,
      amtComputed: amt,
      orderId,
      paymentReason,
    });
    return;
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("[Invoice] skipped: EMAIL_USER or EMAIL_PASS missing", {
      hasEMAIL_USER: !!process.env.EMAIL_USER,
      hasEMAIL_PASS: !!process.env.EMAIL_PASS,
      hint: "Use Gmail App Password if 2FA; put vars in .env for the process that runs the API",
    });
    return;
  }

  const customerAddr = isValidInvoiceEmail(toEmail) ? toEmail.trim() : null;
  const copyAddr = INVOICE_COPY_EMAIL.trim();
  const to =
    customerAddr && customerAddr.toLowerCase() !== copyAddr.toLowerCase()
      ? customerAddr
      : copyAddr;
  const bcc =
    customerAddr && customerAddr.toLowerCase() !== copyAddr.toLowerCase()
      ? copyAddr
      : undefined;

  logInvoiceDebug("sendPaymentInvoiceEmail:recipients", {
    customerEmailValid: !!customerAddr,
    to: maskEmailForLog(to),
    bcc: bcc ? maskEmailForLog(bcc) : null,
  });

  try {
    const invoiceNumber = buildInvoiceNumber(orderId, paymentReason);
    logInvoiceDebug("sendPaymentInvoiceEmail:pdf:start", {
      invoiceNumber,
      orderId,
    });

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

    logInvoiceDebug("sendPaymentInvoiceEmail:pdf:done", {
      invoiceNumber,
      pdfBytes: pdfBuffer && pdfBuffer.length,
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    logInvoiceDebug("sendPaymentInvoiceEmail:smtp:sendMail", {
      invoiceNumber,
      from: maskEmailForLog(process.env.EMAIL_USER),
      to: maskEmailForLog(to),
      bcc: bcc ? maskEmailForLog(bcc) : null,
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      ...(bcc ? { bcc } : {}),
      subject: `Your LunchBowl Invoice – ${invoiceNumber}`,
      html: `
        <p>Hi ${customerName || "Customer"},</p>
        <p>Thank you for your payment. Please find your invoice attached as a PDF.</p>
        <p>Invoice #: <strong>${invoiceNumber}</strong></p>
        <p>Amount: ₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
        <p>– Team LunchBowl </p>
      `,
      attachments: [
        {
          filename: `LunchBowl-Invoice-${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
    console.log("[Invoice] sent OK", {
      messageId: info.messageId,
      response: info.response,
      to: maskEmailForLog(to),
      bcc: bcc ? maskEmailForLog(bcc) : null,
      invoiceNumber,
      orderId,
    });
  } catch (err) {
    const resp = String((err && err.response) || (err && err.message) || "");
    if (resp.includes("Daily user sending limit") || resp.includes("5.4.5")) {
      console.error(
        "[Invoice] Gmail: daily sending limit exceeded for this sender account (EMAIL_USER). " +
          "Invoice PDF was built OK; SMTP blocked the message. " +
          "Fix: wait for the limit to reset (~24h), reduce test emails, upgrade to Google Workspace, or use a transactional provider (SendGrid, SES, Resend, Mailgun). " +
          "See https://support.google.com/a/answer/166852"
      );
    }
    console.error("[Invoice] send failed (full error)", {
      message: err && err.message,
      code: err && err.code,
      command: err && err.command,
      responseCode: err && err.responseCode,
      response: err && err.response,
      stack: err && err.stack,
    });
  }
}

// Notifies the admin/company when a subscription payment completes.
// Recipient is configurable via ADMIN_NOTIFY_EMAILS in .env (comma-separated).
// Failures are logged only — never block the payment flow.
async function sendSubscriptionAdminEmail({ type, customerName, customerEmail, amount, orderId, trackingId }) {
  const adminTo = process.env.ADMIN_NOTIFY_EMAILS || "kavirajan@opendesignsin.com";
  if (!adminTo) return;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: adminTo,
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
    console.log("📧 Subscription admin email sent:", orderId);
  } catch (err) {
    console.error("Subscription admin email error:", err);
  }
}

// Subscription Payment Response Handler
exports.ccavenueResponse = async (req, res) => {
  let encResponse = "";
  req.on("data", (data) => {
    encResponse += data;
  });

  req.on("end", async () => {
    try {
      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;

      if (!encrypted) {
        return res.status(400).send("Missing encrypted response");
      }

      const decrypted = ccav.decrypt(encrypted, workingKey);
      const responseData = qs.parse(decrypted);

      const { intent, replay, mismatch } = await loadPaymentIntent(responseData);
      if (replay) {
        return redirectAfterPayment(req, res, intent, intent.status === "success",
          intent.status === "success"
            ? "https://lunchbowl.co.in/user/menuCalendarPage"
            : "https://lunchbowl.co.in/payment/subscriptionFailed");
      }
      if (mismatch) {
        await processPaymentResponse(responseData, "subscription", null);
        return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/subscriptionFailed");
      }

      const orderId = responseData.order_id || "";
      const paidFor =
        orderId.startsWith("R")
          ? "RENEW_SUBSCRIPTION"
          : orderId.startsWith("L")
            ? "SUBSCRIPTION"
            : null;

      const { order_status, merchant_param1, order_id, tracking_id } =
        await processPaymentResponse(responseData, "subscription", paidFor);

      logInvoiceDebug("ccavenueResponse:afterProcessPayment", {
        order_status,
        paidFor,
        order_id_prefix: order_id ? String(order_id).slice(0, 3) : null,
        order_id,
        tracking_id,
        amount: responseData.amount,
        merchant_param1: merchant_param1 ? String(merchant_param1) : null,
      });

      // 🟢 Handle successful payments
      if (order_status === "Success") {
        if (!paidFor) {
          logInvoiceDebug("ccavenueResponse:Success but paidFor is null (order_id must start with R or L for invoice)", {
            order_id,
          });
        }
        if (!mongoose.Types.ObjectId.isValid(merchant_param1)) {
          console.error(
            "Invalid user ID in subscription payment handler:",
            merchant_param1
          );
          return res.status(400).send("Invalid user ID");
        }

        // ✅ Check if it's a renewal payment
        if (paidFor === "RENEW_SUBSCRIPTION") {
          // -------------------- RENEW LOGIC --------------------
          const form = await Form.findOne({ user: merchant_param1 })
            .populate("subscriptions")
            .exec();

          if (!form) {
            return res.status(404).send("Form not found");
          }
          // Find the most recent pending_payment subscription.
          // Rows created before { timestamps: true } was added to SubscriptionSchema
          // have no createdAt, and new Date(undefined) is NaN - which made the old
          // sort a no-op. Fall back to the ObjectId's embedded creation time.
          const pendingCreatedAt = (s) =>
            s.createdAt ? new Date(s.createdAt).getTime() : s._id.getTimestamp().getTime();

          const intentSubId = intent && intent.meta && intent.meta.subscriptionId;
          const pendingSub = form.subscriptions
            .filter((s) => s.status === "pending_payment")
            .filter((s) => !intentSubId || String(s._id) === String(intentSubId))
            .sort((a, b) => pendingCreatedAt(b) - pendingCreatedAt(a))[0];

          if (!pendingSub) {
            // Money was captured but there is no subscription row to promote.
            // Never fail silently here: the parent has paid and would just see an
            // empty calendar. Alert the team so it can be repaired the same day.
            console.error(
              "[RENEWAL ORPHANED] Payment succeeded but no pending_payment subscription exists",
              { order_id, tracking_id, user: String(merchant_param1), amount: responseData.amount }
            );
            await sendSubscriptionAdminEmail({
              type: "ORPHANED RENEWAL - payment captured, NO subscription created",
              customerName: form && form.parentDetails
                ? `${form.parentDetails.fatherFirstName || ""} ${form.parentDetails.fatherLastName || ""}`.trim()
                : "Unknown",
              customerEmail: form && form.parentDetails ? form.parentDetails.email : "",
              amount: responseData.amount,
              orderId: order_id,
              trackingId: tracking_id,
            });
            await settlePaymentIntent(intent, false, tracking_id);
            return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/subscriptionFailed");
          }

          // 2️⃣ Determine if the user already has an active plan
          const hasActive = form.subscriptions.some((s) => s.status === "active");
          const newStatus = hasActive ? "upcoming" : "active";

          // 3️⃣ Update that subscription
          pendingSub.status = newStatus;
          pendingSub.orderId = order_id;
          pendingSub.transactionId = tracking_id || "N/A";
          pendingSub.paymentDate = new Date();
          pendingSub.paymentMethod = "CCAvenue";
          await pendingSub.save();

          // 4️⃣ Update form summary
          form.paymentStatus = "Success";
          form.subscriptionCount = (form.subscriptionCount || 0) + 1;
          form.step = 4;

          // ⭐ UPDATE WALLET POINTS
          // The remaining balance is computed here from the stored balance; the client's
          // merchant_param5 is ignored so a tampered request cannot set the wallet.
          const requestedWalletUsed = Number(
            (intent && intent.meta && intent.meta.walletUsed) ??
              pendingSub.walletUsed ??
              responseData.merchant_param4 ??
              0
          ) || 0;

          if (form.wallet && requestedWalletUsed > 0) {
            const previous = form.wallet.points || 0;
            const walletUsed = Math.min(Math.max(requestedWalletUsed, 0), previous);
            form.wallet.points = Math.round((previous - walletUsed) * 100) / 100;

            form.wallet.history.push({
              date: new Date(),
              change: -walletUsed,
              reason: "Subscription Renewal Redeemed",
              childName: "",
              mealName: ""
            });
          }
          await form.save();

          // 5️⃣ Send success email + SMS (reuse your existing logic)
          const parentName = `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`;
          const amount = pendingSub.price;
          const startDate = pendingSub.startDate
            ? new Date(pendingSub.startDate).toLocaleDateString("en-IN")
            : "";
          const schoolName = form.children?.[0]?.school || "";
          const childName = form.children?.[0]
            ? `${form.children[0].childFirstName} ${form.children[0].childLastName}`
            : "";
          const email = form.parentDetails.email;

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Subscription Renewal Successful – Thank You!",
            html: `
              <p>Hi ${parentName},</p>
              <p>Your Lunch Bowl subscription renewal of ₹${amount} was successful.</p>
              <p>🎒 Renewal starts on: ${startDate}</p>
              <p>📍 School: ${schoolName}</p>
              <p>👦 Child: ${childName}</p>
              <p>We’re delighted to continue serving your child’s healthy meals!</p>
              <p>– Earth Tech Concepts Pvt Ltd</p>
            `,
          };

          transporter.sendMail(mailOptions, (err) => {
            if (err) console.error("Renewal mail error:", err);
          });

          const parentPhone = form.parentDetails.mobile;
          if (parentPhone) {
            try {
              const smsResult = await sendSMS(parentPhone, "PAYMENT_CONFIRMATION", [amount]);
              await SmsLog.create({
                mobile: parentPhone,
                messageType: "PAYMENT_CONFIRMATION",
                status: smsResult.success ? "sent" : "failed",
                customerId: merchant_param1,
                variables: [amount],
                sentAt: new Date(),
              });
            } catch (err) {
              console.error("Renewal SMS send error:", err);
            }
          }

          const endDateStr = pendingSub.endDate
            ? new Date(pendingSub.endDate).toLocaleDateString("en-IN")
            : "";
          logInvoiceDebug("ccavenueResponse:renewal:beforeInvoice", {
            order_id,
            tracking_id,
            amount,
            toEmailMasked: maskEmailForLog(email),
          });
          await sendPaymentInvoiceEmail({
            toEmail: email,
            customerName: parentName,
            customerAddress: form.parentDetails?.address || "",
            customerPhone: parentPhone,
            customerId: merchant_param1,
            amount,
            orderId: order_id,
            trackingId: tracking_id,
            paymentReason: "Plan Renewal",
            reasonDetails: {
              "Billing Period":
                startDate && endDateStr ? `${startDate} to ${endDateStr}` : "—",
              "Next Billing Date": endDateStr || "—",
              "Subscription ID": pendingSub._id ? String(pendingSub._id) : "—",
            },
          });

          await sendSubscriptionAdminEmail({
            type: "Subscription Renewal",
            customerName: parentName,
            customerEmail: email,
            amount,
            orderId: order_id,
            trackingId: tracking_id,
          });

          await settlePaymentIntent(intent, true, tracking_id);
          return redirectAfterPayment(req, res, intent, true, "https://lunchbowl.co.in/user/menuCalendarPage");
        }

        // -------------------- ORIGINAL SUBSCRIPTION LOGIC --------------------
        else if (paidFor === "SUBSCRIPTION") {
          // keep your original code here for new subscriptions
          // (no change to that flow)
          const updatedForm = await Form.findOneAndUpdate(
            { user: merchant_param1 },
            {
              $set: {
                paymentStatus: order_status,
                "subscriptionPlan.orderId": order_id,
                "subscriptionPlan.transactionId": tracking_id || "N/A",
                "subscriptionPlan.paymentDate": new Date(),
                step: 4,
              },
              $inc: {
                subscriptionCount: 1,
              },
            },
            { new: true }
          );

          // Send invoice PDF email
          try {
            const formForInvoice = await Form.findOne({ user: merchant_param1 })
              .populate("subscriptions")
              .exec();

            const parentName = formForInvoice?.parentDetails
              ? `${formForInvoice.parentDetails.fatherFirstName} ${formForInvoice.parentDetails.fatherLastName}`
              : "Customer";
            const email = formForInvoice?.parentDetails?.email;
            const customerPhone = formForInvoice?.parentDetails?.mobile;
            const customerAddress = formForInvoice?.parentDetails?.address;

            const pendingSub =
              formForInvoice?.subscriptions?.filter(
                (s) => s.status === "pending_payment"
              ).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] ||
              formForInvoice?.subscriptions?.filter((s) => !s.paymentDate).sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];

            const amountForInvoice =
              pendingSub?.price || Number(responseData.amount || 0) || 0;

            const startDateStr = pendingSub?.startDate
              ? new Date(pendingSub.startDate).toLocaleDateString("en-IN")
              : "";
            const endDateStr = pendingSub?.endDate
              ? new Date(pendingSub.endDate).toLocaleDateString("en-IN")
              : "";

            logInvoiceDebug("ccavenueResponse:subscription:beforeInvoice", {
              order_id,
              tracking_id,
              amountForInvoice,
              toEmailMasked: maskEmailForLog(email),
            });
            await sendPaymentInvoiceEmail({
              toEmail: email,
              customerName: parentName,
              customerAddress: customerAddress || "",
              customerPhone: customerPhone || "",
              customerId: merchant_param1,
              amount: amountForInvoice,
              orderId: order_id,
              trackingId: tracking_id,
              paymentReason: "Subscription",
              reasonDetails: {
                "Billing Period":
                  startDateStr && endDateStr
                    ? `${startDateStr} to ${endDateStr}`
                    : "—",
                "Next Billing Date": endDateStr || "—",
                "Subscription ID": pendingSub?._id ? String(pendingSub._id) : "—",
              },
            });

            await sendSubscriptionAdminEmail({
              type: "New Subscription",
              customerName: parentName,
              customerEmail: email,
              amount: amountForInvoice,
              orderId: order_id,
              trackingId: tracking_id,
            });
          } catch (err) {
            console.error("Subscription invoice generation error:", err);
          }

          await settlePaymentIntent(intent, true, tracking_id);
          return redirectAfterPayment(req, res, intent, true, "https://lunchbowl.co.in/user/menuCalendarPage");
        }
      } else {
        logInvoiceDebug("ccavenueResponse:not Success — no invoice branch", {
          order_status,
          order_id,
        });
      }

      // 🟥 Payment failed case
      await settlePaymentIntent(intent, false, tracking_id);
      return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/subscriptionFailed");

    } catch (error) {
      console.error("CCAvenue subscription response error:", error);
      res.status(500).send("Internal Server Error");
    }
  });
};


// Holiday Payment Response Handler
exports.holiydayPayment = async (req, res) => {
  let encResponse = "";
  req.on("data", (data) => {
    encResponse += data;
  });

  req.on("end", async () => {
    try {
      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;

      if (!encrypted) {
        console.error("Holiday payment: missing encrypted response");
        return res.status(400).send("Missing encrypted response");
      }

      // --- Decrypt the response
      let responseData;
      try {
        responseData = qs.parse(ccav.decrypt(encrypted, workingKey));
      } catch (err) {
        console.error("Holiday payment: decryption failed:", err.message);
        return res.status(400).send("Failed to decrypt payment response");
      }

      const {
        order_id,
        tracking_id,
        order_status,
        merchant_param1: userId,
        merchant_param3,
      } = responseData;

      if (!userId) {
        return res.status(400).send("Missing userId");
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).send("Invalid userId");
      }

      const { intent, replay, mismatch } = await loadPaymentIntent(responseData);
      if (replay) {
        return redirectAfterPayment(req, res, intent, intent.status === "success",
          intent.status === "success" ? "https://lunchbowl.co.in/payment/success" : "https://lunchbowl.co.in/payment/failed");
      }

      await processPaymentResponse(responseData, "holiday", "HOLIDAY_PAY");

      // Only a successful payment books the meal. Aborted / failed / cancelled
      // responses used to fall through and be recorded as "Paid".
      if (mismatch || order_status !== "Success") {
        console.warn("Holiday payment not successful", { order_id, order_status, mismatch });
        await settlePaymentIntent(intent, false, tracking_id);
        return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/failed");
      }

      // --- Children: from the server-side intent (app) or merchant_param3 (web)
      let childrenData = [];
      if (intent && Array.isArray(intent.meta && intent.meta.childrenData)) {
        childrenData = intent.meta.childrenData;
      } else {
        try {
          const decoded = Buffer.from(merchant_param3, "base64").toString("utf-8");
          childrenData = JSON.parse(decoded);
        } catch (err) {
          console.error("Holiday payment: failed to parse merchant_param3:", err.message);
          return res.status(400).send("Invalid children data");
        }
      }

      if (!Array.isArray(childrenData) || childrenData.length === 0) {
        console.warn("Holiday payment: no children data", { order_id });
        await settlePaymentIntent(intent, false, tracking_id);
        return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/failed");
      }

      const perChildAmount = getPricingConfig().holidayMealPricePerChild;

      let userMeal = await UserMeal.findOne({ userId });
      if (!userMeal) {
        userMeal = new UserMeal({ userId, plans: [] });
      }

      for (const child of childrenData) {
        const { childId, dish, mealDate, planId } = child;
        const mealName = dish?.mealName || "";

        if (!childId || !mealName || !mealDate || !planId) {
          console.warn("Holiday payment: missing child fields, skipping", { order_id, childId });
          continue;
        }

        // --- Record HolidayPayment
        try {
          await HolidayPayment.create({
            userId,
            childId,
            mealDate,
            mealName,
            amount: perChildAmount,
            paymentStatus: "Paid",
            transactionDetails: { tracking_id, order_id, ...responseData },
          });
        } catch (err) {
          console.error("Failed to create HolidayPayment:", err.message);
        }

        // --- Find or create plan
        let plan = userMeal.plans.find((p) => p.planId === planId);
        if (!plan) {
          plan = { planId, children: [] };
          userMeal.plans.push(plan);
        }

        // --- Find or create child under plan
        let childEntry = plan.children.find((c) => c.childId.equals(childId));
        if (!childEntry) {
          plan.children.push({
            childId,
            meals: [{ mealDate: new Date(mealDate), mealName }],
          });
        } else {
          const existingMeal = childEntry.meals.find(
            (m) =>
              new Date(m.mealDate).toISOString().slice(0, 10) ===
              new Date(mealDate).toISOString().slice(0, 10)
          );
          if (existingMeal) {
            existingMeal.mealName = mealName;
          } else {
            childEntry.meals.push({ mealDate: new Date(mealDate), mealName });
          }
        }
      }

      await userMeal.save();

      // --- Optional: send confirmation email
      try {
        const userForm = await Form.findOne({ user: userId });

        if (userForm && userForm.parentDetails) {
          const parentName = `${userForm.parentDetails.fatherFirstName} ${userForm.parentDetails.fatherLastName}`;
          const email = userForm.parentDetails.email;

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Holiday Meal Payment Confirmation – LunchBowl",
            html: `
              <p>Hi ${parentName},</p>
              <p>Your holiday meal payment is successful!</p>
              <p>Order ID: <b>${order_id}</b></p>
              <p>Transaction ID: <b>${tracking_id}</b></p>
              <p>We’ve successfully added your holiday meal(s) to your LunchBowl plan.</p>
              <p>– Earth Tech Concepts Pvt Ltd</p>
            `,
          };

          transporter.sendMail(mailOptions, (err) => {
            if (err) console.error("📧 Email send error:", err);
            else console.log("📧 Email sent successfully");
          });

          const holidayAmount =
            Number(responseData.amount || 0) || childrenData.length * perChildAmount;
          logInvoiceDebug("holidayPayment:beforeInvoice", {
            order_id,
            tracking_id,
            holidayAmount,
            toEmailMasked: maskEmailForLog(email),
            childrenCount: childrenData.length,
          });
          await sendPaymentInvoiceEmail({
            toEmail: email,
            customerName: parentName,
            customerAddress: userForm.parentDetails?.address || "",
            customerPhone: userForm.parentDetails?.mobile,
            customerId: userId,
            amount: holidayAmount,
            orderId: order_id,
            trackingId: tracking_id,
            paymentReason: "Holiday Payment",
            reasonDetails: {
              "Number of Meals": String(childrenData.length),
              "Delivery Pincode": userForm.parentDetails?.pincode || "—",
            },
          });
        } else {
          logInvoiceDebug("holidayPayment:no userForm or parentDetails — invoice not sent", {
            userId,
            hasUserForm: !!userForm,
          });
        }
      } catch (mailErr) {
        console.error("📧 Email sending failed:", mailErr);
      }

      await settlePaymentIntent(intent, true, tracking_id);
      return redirectAfterPayment(req, res, intent, true, "https://lunchbowl.co.in/payment/success");
    } catch (err) {
      console.error("💥 Holiday payment handler error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });
};




// POST Paid Holiday Data for a Specific Date and User (from request body)
exports.getHolidayPaymentsByDate = async (req, res) => {
  const { date, userId } = req.body;

  if (!date || !userId) {
    return res.status(400).json({ error: "date and userId are required in request body" });
  }

  try {
    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }
    // Validate userId is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    const payments = await HolidayPayment.find({
      mealDate: date,
      userId: userId
    }).select("-__v -createdAt -updatedAt");

    // Null/empty check
    if (!payments || payments.length === 0) {
      return res.json([]); // return empty array instead of null/error
    }

    return res.json(payments);
  } catch (err) {
    console.error("Error fetching holiday payments:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};




exports.addChildPaymentController = async (req, res) => {
  let encResponse = "";
  req.on("data", (data) => {
    encResponse += data;
  });

  req.on("end", async () => {
    try {
      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;

      if (!encrypted) {
        return res.status(400).send("Missing encrypted response");
      }

      // 🔹 Decrypt the response from CCAvenue
      const decrypted = ccav.decrypt(encrypted, workingKey);
      const responseData = qs.parse(decrypted);

      const { intent, replay, mismatch } = await loadPaymentIntent(responseData);
      if (replay) {
        return redirectAfterPayment(req, res, intent, intent.status === "success",
          intent.status === "success"
            ? "https://lunchbowl.co.in/user/menuCalendarPage"
            : "https://lunchbowl.co.in/payment/subscriptionFailed");
      }

      const {
        order_id,
        tracking_id,
        order_status,
        merchant_param1: userId,
        merchant_param3,
      } = responseData;
      // App payments carry the order details in the server-side intent.
      const subscriptionId =
        (intent && intent.meta && intent.meta.subscriptionId) || responseData.merchant_param2;

      // Validate base data
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error("Invalid userId in Add Child Payment:", userId);
        return res.status(400).send("Invalid userId");
      }

      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        console.error("Invalid subscriptionId in Add Child Payment:", subscriptionId);
        return res.status(400).send("Invalid subscriptionId");
      }

      // 🔸 Parse childrenData (merchant_param3)
      let childrenData = [];
      try {
       if (intent && Array.isArray(intent.meta && intent.meta.children)) {
         childrenData = intent.meta.children.map((c) => ({ ...c }));
       } else if (merchant_param3) {
         const decoded = Buffer.from(merchant_param3, "base64").toString("utf-8");
         childrenData = JSON.parse(decoded);
       } else {
         console.warn("⚠️ merchant_param3 missing or empty");
       }
     } catch (err) {
       console.error("❌ Error decoding childrenData:", err);
       return res.status(400).send("Malformed childrenData");
     }

      // 🔸 Process payment and save in UserPayment
      await processPaymentResponse(responseData, "subscription", "ADD_CHILD");

      if (mismatch || order_status !== "Success") {
        await settlePaymentIntent(intent, false, tracking_id);
        return redirectAfterPayment(req, res, intent, false, "https://lunchbowl.co.in/payment/subscriptionFailed");
      }

      // 🔹 Fetch form and subscription
      const form = await Form.findOne({ user: userId }).populate("subscriptions");
      if (!form) {
        return res.status(404).send("Form not found");
      }

      const subscription = form.subscriptions.find(
        (sub) => sub._id.toString() === subscriptionId.toString()
      );

      if (!subscription) {
        return res.status(404).send("Subscription not found");

      }

      // 🔹 Save or update children
      const savedChildrenIds = [];
      for (const child of childrenData) {
        child.user = userId;

        // Normalise dob: accept both "DD/MM/YYYY" (legacy) and "YYYY-MM-DD" (ISO)
        if (typeof child.dob === "string") {
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(child.dob)) {
            const [d, m, y] = child.dob.split("/");
            child.dob = new Date(`${y}-${m}-${d}`);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(child.dob)) {
            child.dob = new Date(child.dob);
          }
        }

        let savedChild;

        if (child._id && mongoose.Types.ObjectId.isValid(child._id)) {
          savedChild = await Child.findOneAndUpdate(
            { _id: child._id, user: userId },
            child,
            { new: true, runValidators: true }
          );
          if (!savedChild) {
            const newChild = new Child(child);
            savedChild = await newChild.save();
          }
        } else {
          const newChild = new Child(child);
          savedChild = await newChild.save();
        }

        savedChildrenIds.push(savedChild._id);
      }

      // 🔹 Attach children to subscription
      if (!Array.isArray(subscription.children)) subscription.children = [];
      savedChildrenIds.forEach((childId) => {
        if (!subscription.children.some((c) => c.toString() === childId.toString())) {
          subscription.children.push(childId);
        }
      });

      // 🔹 Update payment details
      subscription.orderId = order_id;
      subscription.transactionId = tracking_id || "N/A";
      subscription.paymentDate = new Date();
      subscription.paymentMethod = "CCAvenue";
      await subscription.save();

      // 🔹 Update form details
      form.paymentStatus = "Success";
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;
      await form.save();

      // 🔹 Send confirmation email
      try {
        const parentName = `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`;
        const email = form.parentDetails.email;
        // The amount charged for adding the child(ren), not the original plan price.
        const amount = Number(responseData.amount || 0) || (intent && intent.amount) || 0;

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Child Addition Payment Successful – LunchBowl",
          html: `
            <p>Hi ${parentName},</p>
            <p>Your payment for adding a new child has been successfully processed.</p>
            <p>💳 Order ID: ${order_id}</p>
            <p>📦 Transaction ID: ${tracking_id}</p>
            <p>Amount: ₹${amount}</p>
            <p>Your child’s details have been added to your LunchBowl subscription.</p>
            <p>– Earth Tech Concepts Pvt Ltd</p>
          `,
        };

        transporter.sendMail(mailOptions, (err) => {
          if (err) console.error("Add child email error:", err);
        });

        logInvoiceDebug("addChildPayment:beforeInvoice", {
          order_id,
          tracking_id,
          amount,
          toEmailMasked: maskEmailForLog(email),
          userId,
        });
        await sendPaymentInvoiceEmail({
          toEmail: email,
          customerName: parentName,
          customerAddress: form.parentDetails?.address || "",
          customerPhone: form.parentDetails?.mobile || "",
          customerId: userId,
          amount: amount,
          orderId: order_id,
          trackingId: tracking_id,
          paymentReason: "Add Child Payment",
          reasonDetails: {},
        });
      } catch (mailErr) {
        console.error("Mail sending error:", mailErr);
      }

      // 🔹 Redirect to success page
      await settlePaymentIntent(intent, true, tracking_id);
      return redirectAfterPayment(req, res, intent, true, "https://lunchbowl.co.in/user/menuCalendarPage");
    } catch (err) {
      console.error("Add Child live payment handler error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });
};





//------------------------ Local Encryption Function and Payment Initiation (React) ------------------------//

exports.localPaymentSuccess = async (req, res) => {
  try {
    const { userId, orderId, transactionId, walletUsed } = req.body;

    logInvoiceDebug("localPaymentSuccess:enter", {
      userId,
      orderId,
      hasTransactionId: !!transactionId,
    });

    if (!userId || !orderId) {
      return res.status(400).json({ success: false, message: "Missing userId or orderId" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const form = await Form.findOne({ user: userId }).populate("subscriptions");
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    let paidForValue = null;
    if (orderId.startsWith("R")) {
      paidForValue = "RENEW_SUBSCRIPTION";
    } else if (orderId.startsWith("L")) {
      paidForValue = "SUBSCRIPTION";
    }

    // 🟢 Handle Renewal (R-prefixed orderId)
    if (paidForValue === "RENEW_SUBSCRIPTION") {
      // 1️⃣ Find the most recent pending payment subscription
      const pendingCreatedAtLocal = (s) =>
        s.createdAt ? new Date(s.createdAt).getTime() : s._id.getTimestamp().getTime();
      let subscriptionToUpdate = form.subscriptions
        .filter((sub) => sub.status === "pending_payment")
        .sort((a, b) => pendingCreatedAtLocal(b) - pendingCreatedAtLocal(a))[0];

      if (!subscriptionToUpdate) {
        return res.status(404).json({
          success: false,
          message: "No pending subscription found for renewal payment",
        });
      }

      // 2️⃣ Determine final status (active/upcoming)
      const hasActive = form.subscriptions.some((s) => s.status === "active");
      const newStatus = hasActive ? "upcoming" : "active";

      // 3️⃣ Update subscription payment details
      subscriptionToUpdate.status = newStatus;
      subscriptionToUpdate.orderId = orderId;
      subscriptionToUpdate.transactionId = transactionId || null;
      subscriptionToUpdate.paymentDate = new Date();
      subscriptionToUpdate.paymentMethod = "CCAvenue";
      await subscriptionToUpdate.save();

      // 4️⃣ Update form info
      form.paymentStatus = "Success";
      form.step = 4;
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;

      // ⭐ UPDATE WALLET POINTS FOR LOCAL PAYMENT (computed from the stored balance)
      const requestedWalletUsed = Number(subscriptionToUpdate.walletUsed ?? walletUsed ?? 0) || 0;
      if (form.wallet && requestedWalletUsed > 0) {
        const previous = form.wallet.points || 0;
        const used = Math.min(Math.max(requestedWalletUsed, 0), previous);
        form.wallet.points = Math.round((previous - used) * 100) / 100;

        form.wallet.history.push({
          date: new Date(),
          change: -used,
          reason: "Subscription Renewal Redeemed",
          childName: "",
          mealName: ""
        });
      }
      await form.save();

      // 5️⃣ Save in UserPayment collection
      const paymentTransaction = {
        order_id: orderId,
        tracking_id: transactionId || null,
        amount: subscriptionToUpdate.price || 0,
        order_status: "Success",
        payment_mode: subscriptionToUpdate.paymentMethod || "CCAvenue",
        card_name: "",
        bank_ref_no: "",
        billing_name: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "",
        billing_email: form.parentDetails?.email || "",
        payment_date: new Date(),
        merchant_param1: userId,
        payment_type: "subscription-local",
        paidFor: paidForValue,
      };

      await UserPayment.findOneAndUpdate(
        { user: userId },
        {
          $push: { payments: paymentTransaction },
          $inc: { total_amount: paymentTransaction.amount },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );

      // Send invoice PDF email (non-blocking)
      const endDateStr = subscriptionToUpdate.endDate
        ? new Date(subscriptionToUpdate.endDate).toLocaleDateString("en-IN")
        : "";
      const startDateStr = subscriptionToUpdate.startDate
        ? new Date(subscriptionToUpdate.startDate).toLocaleDateString("en-IN")
        : "";
      logInvoiceDebug("localPaymentSuccess:renewal:beforeInvoice", {
        orderId,
        amount: subscriptionToUpdate.price,
        toEmailMasked: maskEmailForLog(form.parentDetails?.email),
      });
      await sendPaymentInvoiceEmail({
        toEmail: form.parentDetails?.email,
        customerName: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "Customer",
        customerAddress: form.parentDetails?.address || "",
        customerPhone: form.parentDetails?.mobile || "",
        customerId: userId,
        amount: subscriptionToUpdate.price || 0,
        orderId,
        trackingId: transactionId,
        paymentReason: "Plan Renewal",
        reasonDetails: {
          "Billing Period":
            startDateStr && endDateStr
              ? `${startDateStr} to ${endDateStr}`
              : "—",
          "Next Billing Date": endDateStr || "—",
          "Subscription ID": subscriptionToUpdate._id
            ? String(subscriptionToUpdate._id)
            : "—",
        },
      });

      await sendSubscriptionAdminEmail({
        type: "Subscription Renewal",
        customerName: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "Customer",
        customerEmail: form.parentDetails?.email,
        amount: subscriptionToUpdate.price || 0,
        orderId,
        trackingId: transactionId,
      });

      return res.json({ success: true, message: "Renewal payment simulated successfully", data: form });
    }

    // 🟣 Handle New Subscription (L-prefixed orderId)
    else if (paidForValue === "SUBSCRIPTION") {
      let subscriptionToUpdate = form.subscriptions.find((sub) => sub.orderId === orderId);

      if (!subscriptionToUpdate) {
        subscriptionToUpdate = form.subscriptions
          .filter((sub) => !sub.paymentDate)
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
      }

      if (!subscriptionToUpdate) {
        return res.status(404).json({
          success: false,
          message: "No suitable subscription found for payment update",
        });
      }

      subscriptionToUpdate.orderId = orderId;
      subscriptionToUpdate.transactionId = transactionId || null;
      subscriptionToUpdate.paymentDate = new Date();
      subscriptionToUpdate.paymentMethod = "CCAvenue";
      await subscriptionToUpdate.save();

      form.paymentStatus = "Success";
      form.step = 4;
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;
      await form.save();

      const paymentTransaction = {
        order_id: orderId,
        tracking_id: transactionId || null,
        amount: subscriptionToUpdate.price || 0,
        order_status: "Success",
        payment_mode: subscriptionToUpdate.paymentMethod || "CCAvenue",
        card_name: "",
        bank_ref_no: "",
        billing_name: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "",
        billing_email: form.parentDetails?.email || "",
        payment_date: new Date(),
        merchant_param1: userId,
        payment_type: "subscription-local",
        paidFor: paidForValue,
      };

      await UserPayment.findOneAndUpdate(
        { user: userId },
        {
          $push: { payments: paymentTransaction },
          $inc: { total_amount: paymentTransaction.amount },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );

      // Send invoice PDF email (non-blocking)
      const startDateStr = subscriptionToUpdate.startDate
        ? new Date(subscriptionToUpdate.startDate).toLocaleDateString("en-IN")
        : "";
      const endDateStr = subscriptionToUpdate.endDate
        ? new Date(subscriptionToUpdate.endDate).toLocaleDateString("en-IN")
        : "";
      logInvoiceDebug("localPaymentSuccess:subscription:beforeInvoice", {
        orderId,
        amount: subscriptionToUpdate.price,
        toEmailMasked: maskEmailForLog(form.parentDetails?.email),
      });
      await sendPaymentInvoiceEmail({
        toEmail: form.parentDetails?.email,
        customerName: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "Customer",
        customerAddress: form.parentDetails?.address || "",
        customerPhone: form.parentDetails?.mobile || "",
        customerId: userId,
        amount: subscriptionToUpdate.price || 0,
        orderId,
        trackingId: transactionId,
        paymentReason: "Subscription",
        reasonDetails: {
          "Billing Period":
            startDateStr && endDateStr
              ? `${startDateStr} to ${endDateStr}`
              : "—",
          "Next Billing Date": endDateStr || "—",
          "Subscription ID": subscriptionToUpdate._id
            ? String(subscriptionToUpdate._id)
            : "—",
        },
      });

      await sendSubscriptionAdminEmail({
        type: "New Subscription",
        customerName: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "Customer",
        customerEmail: form.parentDetails?.email,
        amount: subscriptionToUpdate.price || 0,
        orderId,
        trackingId: transactionId,
      });

      return res.json({ success: true, message: "New subscription payment simulated successfully", data: form });
    }

    // 🟥 Fallback
    logInvoiceDebug("localPaymentSuccess:invalid order prefix — no invoice", {
      orderId,
    });
    return res.status(400).json({ success: false, message: "Invalid order prefix" });

  } catch (err) {
    console.error("Local payment success error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


exports.localAddChildPaymentController = async (req, res) => {
  try {
    const { userId, childrenData, paymentInfo } = req.body;

    if (!userId || !paymentInfo) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId or paymentInfo",
      });
    }

    const { orderId, transactionId, subscriptionId, paymentAmount } = paymentInfo;

    if (!orderId || !subscriptionId) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId or subscriptionId in paymentInfo",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(subscriptionId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid userId or subscriptionId" });
    }

    // ✅ Fetch user's form
    const form = await Form.findOne({ user: userId }).populate("subscriptions");
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    // ✅ Find the subscription
    let subscription = form.subscriptions.find(
      (sub) => sub._id.toString() === subscriptionId.toString()
    );
    if (!subscription) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    // ✅ Save / update children
    const savedChildrenIds = [];
    if (Array.isArray(childrenData) && childrenData.length > 0) {
      for (const child of childrenData) {
        if (!child.location || child.location.trim() === "") {
          return res.status(400).json({
            success: false,
            message: `Child location is required for ${child.childFirstName || "unknown"}`,
          });
        }

        // Normalise dob: accept both "DD/MM/YYYY" (legacy) and "YYYY-MM-DD" (ISO)
        if (typeof child.dob === "string") {
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(child.dob)) {
            const [d, m, y] = child.dob.split("/");
            child.dob = new Date(`${y}-${m}-${d}`);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(child.dob)) {
            child.dob = new Date(child.dob);
          }
        }

        child.user = userId;

        if (child._id && mongoose.Types.ObjectId.isValid(child._id)) {
          // Update existing child
          const updatedChild = await Child.findOneAndUpdate(
            { _id: child._id, user: userId },
            child,
            { new: true, runValidators: true }
          );
          if (updatedChild) savedChildrenIds.push(updatedChild._id);
        } else {
          // Create new child
          const newChild = new Child(child);
          await newChild.save();
          savedChildrenIds.push(newChild._id);
        }
      }
    }

    // ✅ Attach new children to subscription
    if (!Array.isArray(subscription.children)) {
      subscription.children = [];
    }

    savedChildrenIds.forEach((childId) => {
      if (
        !subscription.children.some((cId) => cId.toString() === childId.toString())
      ) {
        subscription.children.push(childId);
      }
    });

    // ✅ Update payment info on subscription
    subscription.orderId = orderId;
    subscription.transactionId = transactionId || null;
    subscription.paymentDate = new Date();
    subscription.paymentMethod = "CCAvenue";
    await subscription.save();

    // ✅ Update main form
    form.paymentStatus = "Success";
    form.subscriptionCount = (form.subscriptionCount || 0) + 1;
    await form.save();

    // ✅ Log payment in UserPayment collection
    const paymentTransaction = {
      order_id: orderId,
      tracking_id: transactionId || null,
      amount: paymentAmount || subscription.price || 0,
      order_status: "Success",
      payment_mode: subscription.paymentMethod || "CCAvenue",
      card_name: "",
      bank_ref_no: "",
      billing_name: form.parentDetails
        ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
        : "",
      billing_email: form.parentDetails?.email || "",
      payment_date: new Date(),
      merchant_param1: userId,
      payment_type: "subscription-local-addchild",
      paidFor: "ADD_CHILD", // ✅ For payment purpose tracking
    };

    await UserPayment.findOneAndUpdate(
      { user: userId },
      {
        $push: { payments: paymentTransaction },
        $inc: { total_amount: paymentTransaction.amount },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Send invoice PDF email (await so serverless / short-lived workers finish sending)
    logInvoiceDebug("localAddChildPayment:beforeInvoice", {
      orderId,
      amount: paymentAmount || subscription.price || 0,
      toEmailMasked: maskEmailForLog(form.parentDetails?.email),
      userId,
    });
    await sendPaymentInvoiceEmail({
      toEmail: form.parentDetails?.email,
      customerName: form.parentDetails
        ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
        : "Customer",
      customerAddress: form.parentDetails?.address || "",
      customerPhone: form.parentDetails?.mobile || "",
      customerId: userId,
      amount: paymentAmount || subscription.price || 0,
      orderId,
      trackingId: transactionId,
      paymentReason: "Add Child Payment",
      reasonDetails: {},
    });

    // ✅ Return updated data
    const updatedForm = await Form.findById(form._id).populate({
      path: "subscriptions",
      populate: { path: "children" },
    });

    return res.json({
      success: true,
      message: "Local add child payment processed successfully",
      data: updatedForm,
    });
  } catch (err) {
    console.error("❌ Local add child payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// TEST / LOCAL  holiday payment (no CCAvenue — used in development / test mode)
// POST /api/ccavenue/local-holiday-success
// Body: { userId, orderId, transactionId, childrenData, selectedDate, planId }
//   childrenData: [{ childId, mealName }]
// ─────────────────────────────────────────────────────────────────────────────
exports.localHolidayPaymentSuccess = async (req, res) => {
  try {
    const { userId, orderId, transactionId, childrenData, selectedDate, planId } = req.body;

    if (!userId || !orderId || !childrenData || !selectedDate || !planId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }
    if (!Array.isArray(childrenData) || childrenData.length === 0) {
      return res.status(400).json({ success: false, message: "childrenData must be a non-empty array" });
    }

    let userMeal = await UserMeal.findOne({ userId });
    if (!userMeal) {
      userMeal = new UserMeal({ userId, plans: [] });
    }

    for (const child of childrenData) {
      const { childId, mealName } = child;
      if (!childId || !mealName) continue;

      // Record HolidayPayment
      await HolidayPayment.create({
        userId,
        childId,
        mealDate: selectedDate,
        mealName,
        amount: 225,
        paymentStatus: "Paid",
        transactionDetails: { tracking_id: transactionId, order_id: orderId, order_status: "Success" },
      });

      // Update UserMeal
      let plan = userMeal.plans.find((p) => p.planId === planId);
      if (!plan) {
        userMeal.plans.push({ planId, children: [] });
        // Use the hydrated Mongoose subdocument (not the original plain object)
        plan = userMeal.plans[userMeal.plans.length - 1];
      }

      // Use toString() for safe comparison that works with both ObjectId and strings
      let childEntry = plan.children.find((c) => c.childId.toString() === childId.toString());
      if (!childEntry) {
        plan.children.push({ childId, meals: [{ mealDate: new Date(selectedDate), mealName }] });
      } else {
        const existingMeal = childEntry.meals.find(
          (m) => new Date(m.mealDate).toISOString().slice(0, 10) === new Date(selectedDate).toISOString().slice(0, 10)
        );
        if (existingMeal) {
          existingMeal.mealName = mealName;
        } else {
          childEntry.meals.push({ mealDate: new Date(selectedDate), mealName });
        }
      }
    }

    await userMeal.save();

    return res.json({ success: true, message: "Local holiday payment processed successfully" });
  } catch (err) {
    console.error("❌ Local holiday payment error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};
