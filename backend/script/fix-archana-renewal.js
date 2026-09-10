/**
 * fix-archana-renewal.js
 * ------------------------------------------------------------------
 * Recreates the renewal that CCAvenue captured but that never became a
 * Subscription (same failure as recreate-renewal-subscription.js and
 * fix-meghna-renewal.js — root cause: cleanupStalePendingSubscriptions in
 * controller/customerController.js).
 *
 * Nothing about the plan is hard-coded. The script re-runs the SAME maths the
 * renew screen uses (RenewSubscriptionPlanStep.js) against the holidays in the
 * DB, so start/end/working days/price are derived, then asserts the derived
 * net payable equals the amount CCAvenue actually captured. It refuses to
 * write if that assertion fails.
 *
 *   node script/fix-archana-renewal.js                 # dry run, local
 *   node script/fix-archana-renewal.js --live          # dry run, live (read-only)
 *   node script/fix-archana-renewal.js --apply         # write to local
 *   node script/fix-archana-renewal.js --apply --live  # write to LIVE
 * ------------------------------------------------------------------
 */
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const UserPayment = require("../models/Payment");
const Holiday = require("../models/holidaySchema");

const PHONE = "9176888759";
const CHILD_FIRST_NAME = "Aarushi";
const PLAN_ID = "3";           // 66 working days
const WORKING_DAYS = 66;
const BASE_PRICE_PER_DAY = 225;

// Captured payment, from the CCAvenue merchant receipt
const CAPTURE = {
  order_id: "RENEW178879393185380",
  tracking_id: "114803379568",
  amount: 13883,
  order_status: "Success",
  payment_mode: "Unified Payments-UPI",
  billing_name: "Archana Subramanian",
  billing_email: "archana.vsubramanian@gmail.com",
  payment_date: "2026-09-07T15:12:00.000Z", // 07 Sep 2026 20:42 IST
  paidFor: "RENEW_SUBSCRIPTION",
};

const APPLY = process.argv.includes("--apply");
const URI = process.argv.includes("--live") ? process.env.MONGO_SOURCE_URI : process.env.MONGO_URI;

// ---- date helpers, copied verbatim in behaviour from the renew screen ----
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const isWeekend = (d) => [0, 6].includes(new Date(d).getUTCDay());
const isWorkingDay = (d, hol) => !isWeekend(d) && !hol.has(ymd(d));
const nextWorkingDay = (d, hol) => { let c = new Date(d); while (!isWorkingDay(c, hol)) c = addDays(c, 1); return c; };
const endByWorkingDays = (start, days, hol) => {
  let c = nextWorkingDay(start, hol), n = 0;
  while (n < days) { if (isWorkingDay(c, hol)) n++; if (n < days) c = addDays(c, 1); }
  while (!isWorkingDay(c, hol)) c = addDays(c, 1);
  return c;
};

(async () => {
  if (!URI) throw new Error("No Mongo URI — run from backend/ with .env present.");
  await mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`\nDB:   ${URI.replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("=".repeat(72));

  const user = await Customer.findOne({ $or: [{ phone: PHONE }, { phone: "+91" + PHONE }] });
  if (!user) throw new Error(`No customer with phone ${PHONE}`);
  console.log(`Parent:  ${user.name} (${user._id})`);

  const kids = await Child.find({ user: user._id });
  const target = kids.filter((c) =>
    String(c.childFirstName || "").trim().toLowerCase().startsWith(CHILD_FIRST_NAME.toLowerCase())
  );
  if (!target.length) {
    console.log("Children on this account:", kids.map((c) => `${c.childFirstName} ${c.childLastName} (${c._id})`));
    throw new Error(`No child matching "${CHILD_FIRST_NAME}".`);
  }
  target.forEach((c) => console.log(`Child:   ${c.childFirstName} ${c.childLastName} — ${c.school} ${c.childClass}-${c.section} (${c._id})`));

  if (await Subscription.findOne({ orderId: CAPTURE.order_id })) {
    console.log(`\nAlready repaired — a subscription already carries ${CAPTURE.order_id}. Nothing to do.`);
    return mongoose.disconnect();
  }

  // ---- derive the plan exactly as the renew screen would have ----
  const hol = new Set((await Holiday.find({}).lean()).map((h) => ymd(h.date)));
  const prev = await Subscription.find({ user: user._id }).sort({ endDate: -1 }).limit(1).lean();
  if (!prev.length) throw new Error("No previous subscription to renew from.");
  const prevEnd = prev[0].endDate;
  console.log(`\nPrevious plan: ${ymd(prevEnd)} end, status "${prev[0].status}", planId ${prev[0].planId}`);

  const startDate = nextWorkingDay(addDays(prevEnd, 1), hol);
  const endDate = endByWorkingDays(startDate, WORKING_DAYS, hol);

  const childCount = target.length;
  const discount = childCount >= 2 ? 0.15 : 0.05; // 66-day tier
  const listPrice = Math.round(WORKING_DAYS * BASE_PRICE_PER_DAY * (1 - discount) * childCount);

  const form = await Form.findOne({ user: user._id });
  if (!form) throw new Error("No form for this user.");
  const walletBefore = (form.wallet && form.wallet.points) || 0;
  const walletUsed = Math.min(walletBefore, listPrice * 0.8);
  const netPayable = listPrice - walletUsed;

  console.log(`\nDerived plan  : ${ymd(startDate)} -> ${ymd(endDate)}  (${WORKING_DAYS} working days, ${hol.size} holidays loaded)`);
  console.log(`List price    : ${WORKING_DAYS} x ${BASE_PRICE_PER_DAY} x ${(1 - discount).toFixed(2)} x ${childCount} = ${listPrice}`);
  console.log(`Wallet        : ${walletBefore} points, ${walletUsed} redeemable  ->  net payable ${netPayable}`);
  console.log(`CCAvenue took : ${CAPTURE.amount}`);

  if (netPayable !== CAPTURE.amount) {
    throw new Error(
      `Derived net payable (${netPayable}) != captured amount (${CAPTURE.amount}). ` +
      `The plan or the holiday list has changed since she paid — reconcile manually before writing.`
    );
  }
  console.log("MATCH — the derived plan reproduces the captured amount exactly.");

  const hasActive = await Subscription.exists({ user: user._id, status: "active", endDate: { $gte: new Date() } });
  const status = hasActive ? "upcoming" : "active";

  const subDoc = {
    user: user._id,
    planId: PLAN_ID,
    startDate, endDate,
    workingDays: WORKING_DAYS,
    price: netPayable,              // renew screen stores the post-wallet total
    paymentMethod: "CCAvenue",
    status,
    children: target.map((c) => c._id),
    orderId: CAPTURE.order_id,
    transactionId: CAPTURE.tracking_id,
    paymentDate: new Date(CAPTURE.payment_date),
    paymentAmount: CAPTURE.amount,
  };

  const up = await UserPayment.findOne({ user: user._id });
  const paymentLogged = up && (up.payments || []).some((p) => p.order_id === CAPTURE.order_id);
  console.log(`\nuserpayments  : ${paymentLogged ? "order ALREADY logged" : "order NOT logged (will add)"}`);
  console.log(`Subscription  : status "${status}"`);
  console.log(JSON.stringify({ ...subDoc, user: String(user._id), children: subDoc.children.map(String) }, null, 2));
  console.log(`\nWallet after  : ${walletBefore} -> ${walletBefore - walletUsed} (debiting the ${walletUsed} she already spent)`);

  if (!APPLY) { console.log("\nDRY RUN only — re-run with --apply to write."); return mongoose.disconnect(); }

  if (!paymentLogged) {
    await UserPayment.findOneAndUpdate(
      { user: user._id },
      { $push: { payments: { ...CAPTURE, payment_date: new Date(CAPTURE.payment_date), currency: "INR", merchant_param1: String(user._id) } },
        $inc: { total_amount: CAPTURE.amount },
        $setOnInsert: { created_at: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );
    console.log("Payment recorded in userpayments.");
  }

  const created = await Subscription.create(subDoc);
  await Form.updateOne({ user: user._id }, { $addToSet: { subscriptions: created._id } });

  if (walletUsed > 0 && walletBefore === (form.wallet && form.wallet.points)) {
    form.wallet.points = walletBefore - walletUsed;
    form.wallet.history.push({
      date: new Date(CAPTURE.payment_date),
      change: -walletUsed,
      reason: "Subscription Renewal Redeemed",
      childName: "", mealName: "",
    });
  }
  form.paymentStatus = "Success";
  form.subscriptionCount = (form.subscriptionCount || 0) + 1;
  form.step = 4;
  await form.save();

  console.log(`\nDONE. Subscription ${created._id} (${status}), form + wallet updated.`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error("\nERROR:", e.message); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
