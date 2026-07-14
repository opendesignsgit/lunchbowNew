/**
 * recreate-renewal-subscription.js
 * ------------------------------------------------------------------
 * Repairs one user's accidentally-deleted renewal by:
 *   1. Recording the captured CCAvenue payment into userpayments
 *      (values taken from the CCAvenue dashboard — see CAPTURE below).
 *   2. Re-creating the Subscription with those real identifiers.
 *   3. Linking the new subscription into Form.subscriptions.
 *
 * Safe by default: DRY RUN unless you pass --apply.
 *
 * USAGE (from the backend/ folder):
 *   node script/recreate-renewal-subscription.js            # DRY RUN
 *   node script/recreate-renewal-subscription.js --apply    # write
 * ------------------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const UserPayment = require("../models/Payment");

// ============ CONFIG — the subscription being recreated =============
const USER_ID      = "69db43d5f5983c9414ccd2e1";
const PLAN_ID      = "3";
const PRICE        = 25245;
const WORKING_DAYS = 66;
const START_DATE   = "2026-07-10T00:00:00.000Z";
const END_DATE     = "2026-10-15T00:00:00.000Z";
const STATUS       = "upcoming";
const CHILD_IDS    = ["69db575bf5983c9414ccd33b", "69db575bf5983c9414ccd33d"];

// ==== The captured payment, read from the CCAvenue dashboard ========
const CAPTURE = {
  order_id:     "RENEW1783601058171995",
  tracking_id:  "114641551774",          // CCAvenue Ref #
  amount:       25245,
  order_status: "Success",               // dashboard: Shipped / "Transaction Successful"
  payment_mode: "Unified Payments-UPI",
  bank_ref_no:  "619086532406",
  billing_name: "nazia shafi",
  billing_email:"shafidba@gmail.com",
  payment_date: "2026-07-09T12:44:18.171Z", // 2026-07-09 18:14 IST
  paidFor:      "RENEW_SUBSCRIPTION",
};
// Also write the payment into userpayments (the "manual capture")?
const WRITE_PAYMENT = true;
// ====================================================================

const APPLY = process.argv.includes("--apply");
const oid = (s) => mongoose.Types.ObjectId(s);

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Run from backend/ with your .env present.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`\nMode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("=".repeat(72));

  // 1. Verify children
  const children = await Child.find({ _id: { $in: CHILD_IDS.map(oid) } });
  console.log("Children to attach:");
  CHILD_IDS.forEach((id) => {
    const c = children.find((x) => String(x._id) === id);
    console.log(`  ${id}  ->  ${c ? `${c.childFirstName} ${c.childLastName} (${c.childClass}-${c.section})` : "!! NOT FOUND"}`);
  });

  // 2. Idempotency checks
  const dupSub = await Subscription.findOne({ orderId: CAPTURE.order_id });
  if (dupSub) {
    console.log(`\nSubscription with orderId ${CAPTURE.order_id} already exists (${dupSub._id}). Nothing to do.`);
    await mongoose.disconnect();
    process.exit(0);
  }
  const up = await UserPayment.findOne({ user: oid(USER_ID) });
  const paymentAlreadyLogged = up?.payments?.some((p) => p.order_id === CAPTURE.order_id);

  // 3. Build the payment transaction (userpayments)
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
    merchant_param1: USER_ID,
  };

  // 4. Build the subscription document
  const subDoc = {
    user: oid(USER_ID),
    planId: PLAN_ID,
    startDate: new Date(START_DATE),
    endDate: new Date(END_DATE),
    workingDays: WORKING_DAYS,
    price: PRICE,
    paymentMethod: "CCAvenue",
    status: STATUS,
    children: CHILD_IDS.map(oid),
    orderId: CAPTURE.order_id,
    transactionId: CAPTURE.tracking_id,
    paymentDate: new Date(CAPTURE.payment_date),
    paymentAmount: CAPTURE.amount,
  };

  console.log(`\nPayment capture -> userpayments  (${WRITE_PAYMENT ? (paymentAlreadyLogged ? "already logged, will skip" : "will add") : "disabled"}):`);
  console.log(JSON.stringify(paymentTx, null, 2));
  console.log("\nSubscription document to insert:");
  console.log(JSON.stringify(subDoc, null, 2));

  if (!APPLY) {
    console.log("\nDRY RUN only — re-run with --apply to write.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // 5. Write payment capture
  if (WRITE_PAYMENT && !paymentAlreadyLogged) {
    await UserPayment.findOneAndUpdate(
      { user: oid(USER_ID) },
      { $push: { payments: paymentTx }, $setOnInsert: { created_at: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );
    console.log("\nPayment recorded in userpayments.");
  }

  // 6. Insert subscription + link to Form
  const created = await Subscription.create(subDoc);
  const linked = await Form.updateOne(
    { user: oid(USER_ID) },
    { $addToSet: { subscriptions: created._id } }
  );

  console.log(`\nDONE.`);
  console.log(`  Subscription _id:  ${created._id}`);
  console.log(`  Form link:         matched=${linked.matchedCount ?? linked.n}, modified=${linked.modifiedCount ?? linked.nModified}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error("Error:", err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
