/**
 * diag-user.js — READ-ONLY. Prints everything needed to diagnose a
 * "paid but no calendar" report for one parent.
 *
 * USAGE (from backend/):
 *   node script/diag-user.js 9176888759                # uses MONGO_URI (.env / .env.local)
 *   node script/diag-user.js 9176888759 --live         # uses MONGO_SOURCE_URI (live)
 *   node script/diag-user.js 9176888759 RENEW17887...  # also hunts for that order id
 *
 * Makes no writes of any kind.
 */
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const UserPayment = require("../models/Payment");

const args = process.argv.slice(2).filter((a) => a !== "--live");
const PHONE = args[0];
const ORDER = args[1] || null;
const URI = process.argv.includes("--live")
  ? process.env.MONGO_SOURCE_URI
  : process.env.MONGO_URI;

if (!PHONE) { console.error("Pass a phone number, e.g. node script/diag-user.js 9176888759"); process.exit(1); }

const line = (t) => console.log("\n" + t + "\n" + "=".repeat(t.length));

(async () => {
  await mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("DB:", URI.replace(/\/\/[^@]*@/, "//***@"));

  const u = await Customer.findOne({
    $or: [{ phone: PHONE }, { phone: "+91" + PHONE }, { phone: Number(PHONE) }],
  }).lean();
  if (!u) { console.log("NO CUSTOMER for", PHONE); return mongoose.disconnect(); }

  line("CUSTOMER");
  console.log({ _id: String(u._id), name: u.name, email: u.email, phone: u.phone, freeTrial: u.freeTrial });

  line("CHILDREN");
  const kids = await Child.find({ user: u._id }).lean();
  kids.forEach((c) =>
    console.log({ _id: String(c._id), name: `${c.childFirstName} ${c.childLastName}`, school: c.school, class: c.childClass, section: c.section })
  );

  line("SUBSCRIPTIONS (source of the calendar tabs)");
  const subs = await Subscription.find({ user: u._id }).sort({ startDate: 1 }).lean();
  if (!subs.length) console.log("  none");
  subs.forEach((s) =>
    console.log({
      _id: String(s._id), status: s.status, planId: s.planId, price: s.price, workingDays: s.workingDays,
      startDate: s.startDate, endDate: s.endDate, orderId: s.orderId, transactionId: s.transactionId,
      paymentDate: s.paymentDate, createdAt: s.createdAt || s._id.getTimestamp(),
      children: (s.children || []).map(String),
    })
  );

  line("FORM");
  const form = await Form.findOne({ user: u._id }).lean();
  console.log(form
    ? { step: form.step, paymentStatus: form.paymentStatus, subscriptionCount: form.subscriptionCount,
        walletPoints: form.wallet && form.wallet.points, subscriptions: (form.subscriptions || []).map(String) }
    : "NONE");

  line("PAYMENTS (proof the money was captured)");
  const up = await UserPayment.findOne({ user: u._id }).lean();
  if (!up) console.log("  no userpayments document");
  else {
    console.log("  total_amount:", up.total_amount, " count:", (up.payments || []).length);
    (up.payments || []).slice(-10).forEach((p) =>
      console.log({ order_id: p.order_id, tracking_id: p.tracking_id, amount: p.amount,
        order_status: p.order_status, paidFor: p.paidFor, payment_mode: p.payment_mode,
        bank_ref_no: p.bank_ref_no, trans_date: p.trans_date || p.payment_date })
    );
  }

  if (ORDER) {
    line(`ORDER ${ORDER}`);
    const hit = await UserPayment.findOne({ "payments.order_id": ORDER }, { user: 1, "payments.$": 1 }).lean();
    console.log(hit ? { user: String(hit.user), payment: hit.payments[0] } : "  NOT PRESENT in userpayments — the CCAvenue response never reached the server");
    const subHit = await Subscription.findOne({ orderId: ORDER }).lean();
    console.log("  subscription with this orderId:", subHit ? String(subHit._id) : "NONE");
  }

  line("VERDICT");
  const paid = (up && up.payments || []).filter((p) => p.order_status === "Success");
  const real = subs.filter((s) => s.status !== "pending_payment");
  console.log(`  successful payments: ${paid.length}   subscriptions that render as tabs: ${real.length}`);
  if (paid.length > real.length) console.log("  => MISMATCH: at least one captured payment has no subscription row.");

  await mongoose.disconnect();
})().catch(async (e) => { console.error("ERROR:", e.message); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
