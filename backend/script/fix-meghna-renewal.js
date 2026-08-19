/**
 * fix-meghna-renewal.js
 * ------------------------------------------------------------------
 * One-off repair: a paid CCAvenue renewal that never got captured.
 * Recreates what ccavenueResponse SHOULD have done:
 *   1. userpayments  — record the captured payment (₹4050 paid)
 *   2. Subscription  — create it (full price 4950, active), link to Form
 *   3. wallet        — deduct the 900 points she redeemed + history entry
 *   4. old plan      — mark the expired original subscription deactivated
 *
 * DRY RUN by default. Nothing is written until you pass --apply.
 * Idempotent: aborts if a subscription with this orderId already exists.
 *
 * USAGE (from backend/ , with .env.local pointing at the target DB):
 *   node script/fix-meghna-renewal.js            # DRY RUN
 *   node script/fix-meghna-renewal.js --apply    # write
 * ------------------------------------------------------------------
 */
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const UserPayment = require("../models/Payment");
const Holiday = require("../models/holidaySchema");

// Same working-day logic the store uses (weekends + holidays collection).
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const isWorkingDay = (d, hset) => {
  const day = new Date(d).getUTCDay();
  return day !== 0 && day !== 6 && !hset.has(ymd(d));
};
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const endDateByWorkingDays = (start, workingDays, hset) => {
  let current = new Date(start);
  while (!isWorkingDay(current, hset)) current = addDays(current, 1);
  let count = 0;
  while (count < workingDays) {
    if (isWorkingDay(current, hset)) count++;
    if (count < workingDays) current = addDays(current, 1);
  }
  while (!isWorkingDay(current, hset)) current = addDays(current, 1);
  return current;
};

// ===================== CONFIG =====================
const PHONE = "9790975338";

const CAPTURE = {
  order_id: "RENEW1787066308333579",
  tracking_id: "114750032353", // CCAvenue Reference #
  amount: 4050, // amount actually charged (after wallet)
  order_status: "Success",
  payment_mode: "Unified Payments-UPI",
  bank_ref_no: "623040522871",
  billing_name: "Meghna E",
  billing_email: "priya.d@workline.hr",
  payment_date: "2026-08-18T15:22:00.000Z", // 18 Aug 2026 20:52 IST
  paidFor: "RENEW_SUBSCRIPTION",
};

const WALLET_USED = 900; // points she redeemed
const SUB_PRICE = 4050; // matches what the app stores (net of wallet)
const PLAN_ID = "1"; // 22-day plan
const WORKING_DAYS = 22;
const START_DATE = "2026-08-19T00:00:00.000Z"; // starts today (confirmed)
const END_DATE = ""; // leave blank to derive from form.subscriptionPlan
const STATUS = "active"; // starts today
// ==================================================

const APPLY = process.argv.includes("--apply");

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Run from backend/ with .env / .env.local present.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`\nMode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("DB:", (process.env.MONGO_URI || "").replace(/\/\/[^@]*@/, "//<creds>@"));
  console.log("=".repeat(72));

  const user = await Customer.findOne({ phone: PHONE });
  if (!user) throw new Error(`No customer with phone ${PHONE}`);
  console.log("User:", String(user._id), "-", user.name, `(${user.email})`);

  const form = await Form.findOne({ user: user._id });
  if (!form) throw new Error("Form not found for user");

  // Resolve plan dates: prefer what she actually selected (form.subscriptionPlan)
  const sp = form.subscriptionPlan || {};
  const planId = sp.planId ? String(sp.planId) : PLAN_ID;
  const workingDays = sp.workingDays || WORKING_DAYS;
  const startDate = new Date(START_DATE || sp.startDate);
  const childIds = (form.subscriptions?.length
    ? (await Subscription.findOne({ user: user._id }))?.children || []
    : []);

  // Resolve endDate: explicit CONFIG → form.subscriptionPlan → compute from
  // workingDays using the same weekend+holiday logic as the store.
  let endDate = END_DATE ? new Date(END_DATE) : sp.endDate ? new Date(sp.endDate) : null;
  if (!endDate || isNaN(endDate.getTime())) {
    const holidayDocs = await Holiday.find({}).lean();
    const hset = new Set(holidayDocs.map((h) => ymd(h.date)));
    endDate = endDateByWorkingDays(startDate, workingDays, hset);
    console.log(
      `\nendDate COMPUTED from ${workingDays} working days starting ${ymd(startDate)} ` +
        `(${holidayDocs.length} holidays loaded) -> ${ymd(endDate)}`
    );
  }

  console.log("\nform.subscriptionPlan:", JSON.stringify(sp, null, 2));
  if (isNaN(endDate.getTime())) {
    throw new Error("endDate unresolved — set END_DATE in CONFIG and re-run.");
  }

  // Idempotency
  const dupSub = await Subscription.findOne({ orderId: CAPTURE.order_id });
  if (dupSub) {
    console.log(`\nSubscription with orderId ${CAPTURE.order_id} already exists (${dupSub._id}). Nothing to do.`);
    return mongoose.disconnect();
  }
  const up = await UserPayment.findOne({ user: user._id });
  const paymentAlreadyLogged = up?.payments?.some((p) => p.order_id === CAPTURE.order_id);

  // Wallet math
  const currentPoints = form.wallet?.points ?? 0;
  if (currentPoints < WALLET_USED) {
    console.warn(
      `\n⚠️  Current wallet points (${currentPoints}) < WALLET_USED (${WALLET_USED}). ` +
        `Was the wallet already deducted? Review before applying.`
    );
  }
  const remainingPoints = currentPoints - WALLET_USED;

  // Build the subscription document
  const subDoc = {
    user: user._id,
    planId,
    startDate,
    endDate,
    workingDays,
    price: SUB_PRICE,
    paymentMethod: "CCAvenue",
    status: STATUS,
    children: childIds,
    orderId: CAPTURE.order_id,
    transactionId: CAPTURE.tracking_id,
    paymentDate: new Date(CAPTURE.payment_date),
    paymentAmount: CAPTURE.amount,
  };

  // Build the payment transaction
  const paymentTx = {
    order_id: CAPTURE.order_id,
    tracking_id: CAPTURE.tracking_id,
    amount: CAPTURE.amount,
    currency: "INR",
    order_status: CAPTURE.order_status,
    payment_mode: CAPTURE.payment_mode,
    bank_ref_no: CAPTURE.bank_ref_no,
    billing_name: CAPTURE.billing_name,
    billing_email: CAPTURE.billing_email,
    payment_date: new Date(CAPTURE.payment_date),
    paidFor: CAPTURE.paidFor,
    merchant_param1: String(user._id),
  };

  // Old expired subs to deactivate (active but ended before the new start)
  const oldActive = await Subscription.find({
    user: user._id,
    status: "active",
    endDate: { $lt: startDate },
  }).lean();

  console.log("\n--- PLAN — subscription to insert ---");
  console.log(JSON.stringify(subDoc, null, 2));
  console.log("\n--- PAYMENT — userpayments entry ---",
    paymentAlreadyLogged ? "(already logged, will skip)" : "");
  console.log(JSON.stringify(paymentTx, null, 2));
  console.log("\n--- WALLET ---");
  console.log(`  current points: ${currentPoints}  -> after -${WALLET_USED} = ${remainingPoints}`);
  console.log("\n--- OLD SUBS to deactivate (ended before new start) ---");
  oldActive.forEach((s) => console.log(`  ${s._id}  status=${s.status}  end=${s.endDate?.toISOString?.() || s.endDate}`));

  if (!APPLY) {
    console.log("\nDRY RUN only — re-run with --apply to write.");
    return mongoose.disconnect();
  }

  // ---- WRITES ----
  if (!paymentAlreadyLogged) {
    await UserPayment.findOneAndUpdate(
      { user: user._id },
      { $push: { payments: paymentTx }, $inc: { total_amount: CAPTURE.amount }, $setOnInsert: { created_at: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );
    console.log("\n✔ payment recorded");
  }

  const created = await Subscription.create(subDoc);
  console.log("✔ subscription created:", String(created._id));

  // deactivate old expired active subs
  if (oldActive.length) {
    await Subscription.updateMany(
      { _id: { $in: oldActive.map((s) => s._id) } },
      { $set: { status: "deactivated" } }
    );
    console.log(`✔ deactivated ${oldActive.length} expired subscription(s)`);
  }

  // link + wallet deduction + form status (validate only modified fields)
  if (!form.wallet) form.wallet = { points: 0, history: [] };
  form.wallet.points = remainingPoints;
  form.wallet.history.push({
    change: -WALLET_USED,
    reason: "Subscription Renewal Redeemed",
    childName: "",
    mealName: "",
    date: new Date(),
  });
  form.subscriptions.addToSet
    ? form.subscriptions.addToSet(created._id)
    : (form.subscriptions = [...new Set([...(form.subscriptions || []).map(String), String(created._id)])]);
  form.paymentStatus = "Success";
  form.step = 4;
  form.subscriptionCount = (form.subscriptionCount || 0) + 1;
  await form.save({ validateModifiedOnly: true });
  console.log("✔ wallet deducted, subscription linked, form updated");

  console.log("\nDONE.");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("\nError:", err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
