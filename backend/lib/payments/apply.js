/**
 * Business effect of a settled payment, one function per intent type.
 *
 * Each function is idempotent for the same orderId (a replay finds the work already
 * done and returns), reads everything it needs from the intent's `meta` snapshot,
 * and returns a short summary. They throw on a genuine inconsistency (no plan to
 * activate, subscription missing): settlement then keeps the intent as paid with
 * `applyError` set and alerts the admin — money that was captured is never lost.
 *
 * Customer emails/SMS are sent after the database work and never fail the apply.
 */
const mongoose = require("mongoose");
const Form = require("../../models/Form");
const Subscription = require("../../models/subscriptionModel");
const Child = require("../../models/childModel");
const UserMeal = require("../../models/UserMeal");
const HolidayPayment = require("../../models/HolidayPayment");
const SmsLog = require("../../models/SmsLog");
const { sendSMS } = require("../sms-sender/smsService");
const { getPricingConfig, toDateKey, todayKeyIST } = require("../pricing");
const emails = require("./emails");

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "");
const parentNameOf = (form) =>
  form && form.parentDetails
    ? `${form.parentDetails.fatherFirstName || ""} ${form.parentDetails.fatherLastName || ""}`.trim() ||
      "Customer"
    : "Customer";

const paymentMethodFor = (via) =>
  via === "manual" ? "Manual" : via === "local" ? "Test" : "CCAvenue";

async function logSms(mobile, type, variables, customerId, result) {
  try {
    await SmsLog.create({
      mobile,
      messageType: type,
      status: result && result.success ? "sent" : "failed",
      customerId,
      variables,
      sentAt: new Date(),
    });
  } catch (err) {
    // logging only
  }
}

// ─── Subscription / renewal ───────────────────────────────────────────────────

/**
 * Finds the plan this payment is for. Order of preference:
 *  1. the plan named in the intent (meta.subscriptionId) — any status, so a replay
 *     after activation still resolves to the same row;
 *  2. the newest pending_payment plan of the user;
 *  3. a fresh row recreated from the intent's plan snapshot (meta.plan) — covers a
 *     pending row that was cleaned up before a late payment arrived.
 */
async function resolvePlan(intent, form) {
  const subs = form.subscriptions || [];
  if (intent.meta && intent.meta.subscriptionId) {
    const byId = subs.find((s) => String(s._id) === String(intent.meta.subscriptionId));
    if (byId) return { sub: byId, recreated: false };
  }
  const pending = subs
    .filter((s) => s.status === "pending_payment")
    .sort((a, b) => (b.createdAt ? +new Date(b.createdAt) : b._id.getTimestamp()) - (a.createdAt ? +new Date(a.createdAt) : a._id.getTimestamp()))[0];
  if (pending) return { sub: pending, recreated: false };

  const snap = intent.meta && intent.meta.plan;
  if (snap && snap.startDate && snap.endDate && snap.workingDays) {
    const sub = new Subscription({
      user: intent.user,
      planId: String(snap.planId || "1"),
      startDate: snap.startDate,
      endDate: snap.endDate,
      workingDays: snap.workingDays,
      price: snap.price != null ? snap.price : intent.amount,
      walletUsed: snap.walletUsed || 0,
      status: "pending_payment",
      children: (snap.children || []).filter(mongoose.Types.ObjectId.isValid).map((id) => mongoose.Types.ObjectId(id)),
    });
    await sub.save();
    form.subscriptions.push(sub);
    return { sub, recreated: true };
  }
  return { sub: null, recreated: false };
}

async function applyPlanPayment({ intent, payment, via }) {
  const form = await Form.findOne({ user: intent.user }).populate("subscriptions");
  if (!form) throw new Error("Form not found for user");

  const { sub, recreated } = await resolvePlan(intent, form);
  if (!sub) throw new Error("No pending plan to activate and no plan snapshot on the intent");

  // Replay: this very order already activated the plan.
  if (sub.status !== "pending_payment" && sub.orderId === payment.orderId) {
    return { kind: intent.type, subscriptionId: String(sub._id), alreadyApplied: true };
  }

  const today = todayKeyIST();
  const otherActive = (form.subscriptions || []).some(
    (s) =>
      String(s._id) !== String(sub._id) &&
      s.status === "active" &&
      (toDateKey(s.endDate) || "") >= today
  );
  const hadPaidPlanBefore = (form.subscriptions || []).some(
    (s) => String(s._id) !== String(sub._id) && s.paymentDate
  ) || form.paymentStatus === "Success";

  sub.status = otherActive ? "upcoming" : "active";
  sub.orderId = payment.orderId;
  sub.transactionId = payment.trackingId || "N/A";
  sub.paymentDate = new Date();
  sub.paymentAmount = payment.amount;
  sub.paymentMethod = paymentMethodFor(via);
  sub.payments = sub.payments || [];
  if (!sub.payments.some((p) => p.orderId === payment.orderId)) {
    sub.payments.push({
      orderId: payment.orderId,
      trackingId: payment.trackingId,
      amount: payment.amount,
      type: hadPaidPlanBefore ? "renewal" : "subscription",
      paidAt: new Date(),
    });
  }
  await sub.save();

  // Wallet: deduct what was redeemed at checkout (server-stored), capped at the balance.
  const requestedWallet = Number(
    intent.meta && intent.meta.walletUsed != null ? intent.meta.walletUsed : sub.walletUsed || 0
  ) || 0;
  let walletUsed = 0;
  if (!form.wallet) form.wallet = { points: 0, history: [] };
  if (requestedWallet > 0) {
    const previous = form.wallet.points || 0;
    walletUsed = Math.min(requestedWallet, previous);
    form.wallet.points = Math.round((previous - walletUsed) * 100) / 100;
    form.wallet.history.push({
      date: new Date(),
      change: -walletUsed,
      reason: "Subscription Renewal Redeemed",
      childName: "",
      mealName: "",
    });
  }
  form.paymentStatus = "Success";
  form.step = 4;
  form.subscriptionCount = (form.subscriptionCount || 0) + 1;
  // Legacy forms may fail full validation (OTP signups without email etc.).
  await form.save({ validateModifiedOnly: true });

  // ── Customer communication (never fails the apply) ──
  const kind = hadPaidPlanBefore ? "renewal" : "subscription";
  const parentName = parentNameOf(form);
  const email = form.parentDetails && form.parentDetails.email;
  const mobile = form.parentDetails && form.parentDetails.mobile;
  const amount = payment.amount;
  try {
    if (kind === "renewal") {
      const firstChild = form.children && form.children[0];
      await emails.sendMail({
        to: emails.isValidEmail(email) ? email : null,
        subject: "Subscription Renewal Successful – Thank You!",
        html: `
          <p>Hi ${parentName},</p>
          <p>Your Lunch Bowl subscription renewal of ₹${amount} was successful.</p>
          <p>🎒 Renewal starts on: ${fmt(sub.startDate)}</p>
          ${firstChild ? `<p>👦 Child: ${firstChild.childFirstName} ${firstChild.childLastName}</p>` : ""}
          <p>We’re delighted to continue serving your child’s healthy meals!</p>
          <p>– Earth Tech Concepts Pvt Ltd</p>`,
      });
    } else {
      await emails.sendMail({
        to: emails.isValidEmail(email) ? email : null,
        subject: "Your LunchBowl subscription is active",
        html: `
          <p>Hi ${parentName},</p>
          <p>Thank you! Your payment of ₹${amount} was received and your LunchBowl plan is active.</p>
          <p>📅 Plan: ${sub.workingDays} working days, ${fmt(sub.startDate)} to ${fmt(sub.endDate)}</p>
          <p>You can now choose meals in your menu calendar.</p>
          <p>– Earth Tech Concepts Pvt Ltd</p>`,
      });
    }
    if (mobile) {
      const r = await sendSMS(mobile, "PAYMENT_CONFIRMATION", [amount]);
      await logSms(mobile, "PAYMENT_CONFIRMATION", [amount], intent.user, r);
    }
    await emails.sendPaymentInvoiceEmail({
      toEmail: email,
      customerName: parentName,
      customerAddress: (form.parentDetails && form.parentDetails.address) || "",
      customerPhone: mobile || "",
      customerId: intent.user,
      amount,
      orderId: payment.orderId,
      trackingId: payment.trackingId,
      paymentReason: kind === "renewal" ? "Plan Renewal" : "Subscription",
      reasonDetails: {
        "Billing Period": `${fmt(sub.startDate)} to ${fmt(sub.endDate)}`,
        "Next Billing Date": fmt(sub.endDate) || "—",
        "Subscription ID": String(sub._id),
      },
    });
    await emails.sendSubscriptionAdminEmail({
      type: kind === "renewal" ? "Subscription Renewal" : "New Subscription",
      customerName: parentName,
      customerEmail: email,
      amount,
      orderId: payment.orderId,
      trackingId: payment.trackingId,
    });
  } catch (err) {
    console.error("[apply] customer communication failed:", err && err.message);
  }

  return {
    kind,
    subscriptionId: String(sub._id),
    status: sub.status,
    walletUsed,
    recreated,
    startDate: toDateKey(sub.startDate),
    endDate: toDateKey(sub.endDate),
    parentName,
  };
}

// ─── Add child ────────────────────────────────────────────────────────────────

const normalizeDob = (dob) => {
  if (typeof dob !== "string") return dob;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) {
    const [d, m, y] = dob.split("/");
    return new Date(`${y}-${m}-${d}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return new Date(dob);
  return dob;
};

async function applyAddChild({ intent, payment, via }) {
  const subscriptionId = intent.meta && intent.meta.subscriptionId;
  const children = (intent.meta && intent.meta.children) || [];
  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) throw new Error("Add-child intent has no subscription");
  if (!Array.isArray(children) || children.length === 0) throw new Error("Add-child intent has no children");

  const subscription = await Subscription.findOne({ _id: subscriptionId, user: intent.user });
  if (!subscription) throw new Error("Subscription not found for add-child payment");
  const form = await Form.findOne({ user: intent.user });
  if (!form) throw new Error("Form not found for user");

  subscription.payments = subscription.payments || [];
  if (subscription.payments.some((p) => p.orderId === payment.orderId)) {
    return { kind: "addChild", subscriptionId: String(subscription._id), alreadyApplied: true };
  }

  const savedIds = [];
  for (const raw of children) {
    const child = { ...raw, user: intent.user, dob: normalizeDob(raw.dob) };
    delete child.__v;
    let saved = null;
    if (child._id && mongoose.Types.ObjectId.isValid(child._id)) {
      saved = await Child.findOneAndUpdate({ _id: child._id, user: intent.user }, child, {
        new: true,
        runValidators: true,
      });
    }
    if (!saved) {
      delete child._id;
      // Same child submitted twice (e.g. two intents for the same unpaid attempt):
      // match on name + dob so a duplicate is never created.
      saved = await Child.findOne({
        user: intent.user,
        childFirstName: child.childFirstName,
        childLastName: child.childLastName,
        dob: child.dob,
      });
      if (!saved) saved = await new Child(child).save();
    }
    savedIds.push(saved._id);
  }

  subscription.children = subscription.children || [];
  for (const id of savedIds) {
    if (!subscription.children.some((c) => String(c) === String(id))) subscription.children.push(id);
  }
  subscription.payments.push({
    orderId: payment.orderId,
    trackingId: payment.trackingId,
    amount: payment.amount,
    type: "addChild",
    paidAt: new Date(),
  });
  await subscription.save();

  const parentName = parentNameOf(form);
  const email = form.parentDetails && form.parentDetails.email;
  try {
    await emails.sendMail({
      to: emails.isValidEmail(email) ? email : null,
      subject: "Child Addition Payment Successful – LunchBowl",
      html: `
        <p>Hi ${parentName},</p>
        <p>Your payment for adding a child has been successfully processed.</p>
        <p>💳 Order ID: ${payment.orderId}</p>
        <p>📦 Transaction ID: ${payment.trackingId || "—"}</p>
        <p>Amount: ₹${payment.amount}</p>
        <p>Your child’s details have been added to your LunchBowl subscription.</p>
        <p>– Earth Tech Concepts Pvt Ltd</p>`,
    });
    await emails.sendPaymentInvoiceEmail({
      toEmail: email,
      customerName: parentName,
      customerAddress: (form.parentDetails && form.parentDetails.address) || "",
      customerPhone: (form.parentDetails && form.parentDetails.mobile) || "",
      customerId: intent.user,
      amount: payment.amount,
      orderId: payment.orderId,
      trackingId: payment.trackingId,
      paymentReason: "Add Child Payment",
      reasonDetails: { "Subscription ID": String(subscription._id), Children: String(savedIds.length) },
    });
    await emails.sendSubscriptionAdminEmail({
      type: "Add Child Payment",
      customerName: parentName,
      customerEmail: email,
      amount: payment.amount,
      orderId: payment.orderId,
      trackingId: payment.trackingId,
    });
  } catch (err) {
    console.error("[apply] add-child communication failed:", err && err.message);
  }

  return {
    kind: "addChild",
    subscriptionId: String(subscription._id),
    childrenAdded: savedIds.length,
    parentName,
  };
}

// ─── Saturday / holiday meal ──────────────────────────────────────────────────

async function applyHoliday({ intent, payment, via }) {
  const childrenData = (intent.meta && intent.meta.childrenData) || [];
  if (!Array.isArray(childrenData) || childrenData.length === 0) throw new Error("Holiday intent has no meals");

  const userId = intent.user;
  const perChild = getPricingConfig().holidayMealPricePerChild;
  let userMeal = await UserMeal.findOne({ userId });
  if (!userMeal) userMeal = new UserMeal({ userId, plans: [] });

  let booked = 0;
  for (const item of childrenData) {
    const { childId, planId } = item;
    const mealDate = toDateKey(item.mealDate);
    const mealName = (item.dish && item.dish.mealName) || item.mealName || "";
    if (!childId || !mealName || !mealDate || !planId) continue;

    const exists = await HolidayPayment.findOne({
      userId,
      childId: String(childId),
      mealDate,
      "transactionDetails.order_id": payment.orderId,
    }).select("_id");
    if (!exists) {
      await HolidayPayment.create({
        userId,
        childId: String(childId),
        mealDate,
        mealName,
        amount: perChild,
        paymentStatus: "Paid",
        transactionDetails: {
          tracking_id: payment.trackingId,
          order_id: payment.orderId,
          order_status: "Success",
          via,
        },
      });
    }

    let plan = userMeal.plans.find((p) => p.planId === String(planId));
    if (!plan) {
      userMeal.plans.push({ planId: String(planId), children: [] });
      // use the hydrated subdocument, not the plain object we pushed
      plan = userMeal.plans[userMeal.plans.length - 1];
    }
    let entry = plan.children.find((c) => String(c.childId) === String(childId));
    if (!entry) {
      plan.children.push({ childId, meals: [{ mealDate: new Date(mealDate), mealName }] });
    } else {
      const existing = entry.meals.find((m) => toDateKey(m.mealDate) === mealDate);
      if (existing) {
        existing.mealName = mealName;
        existing.deleted = false;
      } else {
        entry.meals.push({ mealDate: new Date(mealDate), mealName });
      }
    }
    booked++;
  }
  await userMeal.save();
  if (booked === 0) throw new Error("Holiday intent had no valid meals to book");

  const form = await Form.findOne({ user: userId });
  const parentName = parentNameOf(form);
  const email = form && form.parentDetails && form.parentDetails.email;
  try {
    await emails.sendMail({
      to: emails.isValidEmail(email) ? email : null,
      subject: "Holiday Meal Payment Confirmation – LunchBowl",
      html: `
        <p>Hi ${parentName},</p>
        <p>Your holiday meal payment is successful!</p>
        <p>Order ID: <b>${payment.orderId}</b></p>
        <p>Transaction ID: <b>${payment.trackingId || "—"}</b></p>
        <p>We’ve successfully added your holiday meal(s) to your LunchBowl plan.</p>
        <p>– Earth Tech Concepts Pvt Ltd</p>`,
    });
    if (form) {
      await emails.sendPaymentInvoiceEmail({
        toEmail: email,
        customerName: parentName,
        customerAddress: (form.parentDetails && form.parentDetails.address) || "",
        customerPhone: (form.parentDetails && form.parentDetails.mobile) || "",
        customerId: userId,
        amount: payment.amount,
        orderId: payment.orderId,
        trackingId: payment.trackingId,
        paymentReason: "Holiday Payment",
        reasonDetails: {
          "Number of Meals": String(booked),
          Date: childrenData[0] ? String(toDateKey(childrenData[0].mealDate) || "") : "—",
        },
      });
    }
  } catch (err) {
    console.error("[apply] holiday communication failed:", err && err.message);
  }

  return { kind: "holiday", mealsBooked: booked, date: toDateKey(childrenData[0].mealDate), parentName };
}

const APPLIERS = {
  subscription: applyPlanPayment,
  renewal: applyPlanPayment,
  addChild: applyAddChild,
  holiday: applyHoliday,
};

module.exports = { APPLIERS, applyPlanPayment, applyAddChild, applyHoliday, resolvePlan };
