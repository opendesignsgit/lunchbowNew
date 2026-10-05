/**
 * fix-prasanna-renewal.js
 * ------------------------------------------------------------------
 * Recreates the renewal that CCAvenue captured but that never became a
 * Subscription (same failure as fix-archana-renewal.js / fix-meghna-renewal.js —
 * root cause: cleanupStalePendingSubscriptions deletes the pending_payment sub
 * during the UPI round-trip, so the callback finds nothing to activate).
 *
 * Nothing about the plan is hard-coded beyond the plan the customer chose. The
 * script re-runs the SAME maths the renew screen uses (RenewSubscriptionPlanStep.js)
 * against the holidays in the DB, derives start/end/price, and REFUSES to write
 * unless the derived net payable equals the amount CCAvenue actually captured.
 *
 *   node script/fix-prasanna-renewal.js                 # dry run, local
 *   node script/fix-prasanna-renewal.js --live          # dry run, live (read-only)
 *   node script/fix-prasanna-renewal.js --apply         # write to local
 *   node script/fix-prasanna-renewal.js --apply --live  # write to LIVE
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

const PHONE = "9962507363";
const PLAN_ID = "1";           // 22 working days (ids: 22->1, 66->3, 132->6)
const WORKING_DAYS = 22;
const BASE_PRICE_PER_DAY = 225;

// Captured payment, from the CCAvenue merchant receipt
const CAPTURE = {
  order_id: "RENEW1791118042182312",
  tracking_id: "114876970335",
  amount: 4950,
  order_status: "Success",
  payment_mode: "Unified Payments-UPI",
  billing_name: "KR Prasanna",
  billing_email: "prasannit@gmail.com",
  payment_date: "2026-10-04T12:47:00.000Z", // 04 Oct 2026 18:17 IST
  paidFor: "RENEW_SUBSCRIPTION",
};

const APPLY = process.argv.includes("--apply");
const uriArg = process.argv.find((a) => a.startsWith("--uri="));
const wantLive = process.argv.includes("--live");
let URI, TARGET_LABEL;
if (uriArg) {
  URI = uriArg.slice(6);
  TARGET_LABEL = "explicit --uri";
} else if (wantLive && process.env.MONGO_SOURCE_URI) {
  URI = process.env.MONGO_SOURCE_URI;
  TARGET_LABEL = "MONGO_SOURCE_URI (live)";
} else if (wantLive) {
  URI = process.env.MONGO_URI;
  TARGET_LABEL = "MONGO_URI (no MONGO_SOURCE_URI here — this is normal on the server)";
} else {
  URI = process.env.MONGO_URI;
  TARGET_LABEL = "MONGO_URI";
}
const isLocal = /localhost|127\.0\.0\.1/.test(URI || "");
const showTarget = () => {
  console.log(`DB:   ${String(URI).replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(`From: ${TARGET_LABEL}`);
  if (!isLocal) console.log("      *** THIS IS NOT localhost — you are pointed at a REMOTE database ***");
};

// ---- date helpers, same behaviour as the renew screen ----
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
// renew-screen discount model (RenewSubscriptionPlanStep.js)
const discountFor = (days, childCount) => {
  const d = childCount >= 2
    ? { 22: 0.05, 66: 0.15, 132: 0.2 }
    : { 22: 0, 66: 0.05, 132: 0.1 };
  return d[days] || 0;
};

(async () => {
  if (!URI) throw new Error(
    "No Mongo URI resolved.\n" +
    "  On the server : run WITHOUT --live (MONGO_URI in .env is already live), or pass --uri=<connection string>.\n" +
    "  On your PC    : --live needs MONGO_SOURCE_URI in backend/.env.local."
  );
  await mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("");
  showTarget();
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("=".repeat(72));

  const user = await Customer.findOne({ $or: [{ phone: PHONE }, { phone: "+91" + PHONE }] });
  if (!user) throw new Error(`No customer with phone ${PHONE}`);
  console.log(`Parent:  ${user.name} (${user._id})`);

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

  // Renewals keep the same children as the previous subscription.
  let childIds = (prev[0].children || []).map((c) => c);
  if (!childIds.length) {
    const kids = await Child.find({ user: user._id });
    childIds = kids.map((c) => c._id);
    console.log(`(previous sub had no children listed — falling back to all ${kids.length} children on the account)`);
  }
  const childDocs = await Child.find({ _id: { $in: childIds } });
  childDocs.forEach((c) => console.log(`Child:   ${c.childFirstName} ${c.childLastName} — ${c.school} ${c.childClass}-${c.section} (${c._id})`));
  const childCount = childIds.length;

  const startDate = nextWorkingDay(addDays(prevEnd, 1), hol);
  const endDate = endByWorkingDays(startDate, WORKING_DAYS, hol);

  const discount = discountFor(WORKING_DAYS, childCount);
  const listPrice = Math.round(WORKING_DAYS * BASE_PRICE_PER_DAY * (1 - discount) * childCount);

  const form = await Form.findOne({ user: user._id });
  if (!form) throw new Error("No form for this user.");
  const walletBefore = (form.wallet && form.wallet.points) || 0;
  const walletUsed = Math.min(walletBefore, listPrice * 0.8);
  const netPayable = listPrice - walletUsed;

  console.log(`\nDerived plan  : ${ymd(startDate)} -> ${ymd(endDate)}  (${WORKING_DAYS} working days, ${childCount} child(ren), ${hol.size} holidays loaded)`);
  console.log(`List price    : ${WORKING_DAYS} x ${BASE_PRICE_PER_DAY} x ${(1 - discount).toFixed(2)} x ${childCount} = ${listPrice}`);
  console.log(`Wallet        : ${walletBefore} points, ${walletUsed} redeemable  ->  net payable ${netPayable}`);
  console.log(`CCAvenue took : ${CAPTURE.amount}`);

  if (netPayable !== CAPTURE.amount) {
    throw new Error(
      `Derived net payable (${netPayable}) != captured amount (${CAPTURE.amount}). ` +
      `The plan/children/holidays differ from what she paid — reconcile manually before writing.`
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
    price: netPayable,
    paymentMethod: "CCAvenue",
    status,
    children: childIds,
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
  console.log(`\nWallet after  : ${walletBefore} -> ${walletBefore - walletUsed} (debiting the ${walletUsed} already spent)`);

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
