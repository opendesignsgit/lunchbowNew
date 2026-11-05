/**
 * End-to-end check of payment capture against a real MongoDB.
 *
 *   MONGO_URL=mongodb://127.0.0.1:27017 node test/integration/payments.int.js
 *
 * Not part of `npm test` (needs Mongo). Mail and SMS are stubbed; nothing leaves the
 * machine. Every scenario below corresponds to a production incident or a defect found
 * in review: UPI callback never arriving, replayed callbacks, amount tampering,
 * unpaid plans reaching the kitchen, add-child duplicates, holiday booking loss.
 */
const path = require("path");
const BE = path.resolve(__dirname, "..", "..");
const SCRATCH = "/tmp/claude-0/-home-user/188222d3-9adc-5188-aa5c-3c2c99b06b3f/scratchpad/itest";
const beRequire = (m) => require(require.resolve(m, { paths: [BE] }));
const devRequire = (m) => require(require.resolve(m, { paths: [SCRATCH, BE] }));

process.env.JWT_SECRET = "test-secret";
process.env.API_PUBLIC_URL = "https://api.test";
process.env.STORE_URL = "https://store.test";
delete process.env.CCAV_MODE;
delete process.env.ALLOW_LOCAL_PAYMENTS;
delete process.env.CCAV_STATUS_API_ENABLED;
process.env.RUN_CRON = "false";

// Stub mail + SMS + CCAvenue status API.
const nm = beRequire("nodemailer");
nm.createTransport = () => ({ sendMail: (o, cb) => (cb ? cb(null, {}) : Promise.resolve({})) });
const smsPath = require.resolve(path.join(BE, "lib/sms-sender/smsService"));
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: { sendSMS: async () => ({ success: true }) } };
const statusStub = { enabled: false, answers: {} };
const statusPath = require.resolve(path.join(BE, "lib/ccavenueStatus"));
const realStatus = require(statusPath);
require.cache[statusPath].exports = {
  ...realStatus,
  isEnabled: () => statusStub.enabled,
  fetchOrderStatus: async (orderId) => statusStub.answers[orderId] || { ok: false, error: "no_stub" },
};

const request = devRequire("supertest");
const assert = require("assert/strict");

(async () => {
  const mongoose = beRequire("mongoose");
  const url = `${process.env.MONGO_URL || "mongodb://127.0.0.1:27017"}/lbpay_${Date.now()}`;
  await mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });

  const express = beRequire("express");
  const app = express();
  app.use(express.json());
  app.use("/api/ccavenue/", require(path.join(BE, "routes/ccavenue")));
  app.use("/api/customer/", require(path.join(BE, "routes/customerRoutes")));
  app.use("/api/orders/", require(path.join(BE, "routes/orderRoutes")));
  app.use("/api/admin-ops/payments", require(path.join(BE, "routes/adminPaymentsRoutes")));

  const Customer = require(path.join(BE, "models/Customer"));
  const Admin = require(path.join(BE, "models/Admin"));
  const Form = require(path.join(BE, "models/Form"));
  const Child = require(path.join(BE, "models/childModel"));
  const Subscription = require(path.join(BE, "models/subscriptionModel"));
  const UserMeal = require(path.join(BE, "models/UserMeal"));
  const HolidayPayment = require(path.join(BE, "models/HolidayPayment"));
  const PaymentIntent = require(path.join(BE, "models/PaymentIntent"));
  const UserPayment = require(path.join(BE, "models/Payment"));
  const ccav = require(path.join(BE, "utils/ccavutil"));
  const { signInToken } = require(path.join(BE, "config/auth"));
  const { getCcavConfig } = require(path.join(BE, "lib/ccavenue"));
  const { runReconcilePayments } = require(path.join(BE, "jobs/reconcilePayments"));
  const { todayKeyIST, addDaysKey, nextWorkingDayKey, countWorkingDays } = require(path.join(BE, "lib/pricing"));
  const key = getCcavConfig().workingKey;

  // ── fixtures ──
  const cust = await Customer.create({ name: "Test Parent", email: "p@example.com", phone: "9876543210" });
  const child = await Child.create({ user: cust._id, childFirstName: "A", childLastName: "B", dob: new Date("2018-01-01"), lunchTime: "11:00 AM - 12:00 PM", school: "S", location: "L", childClass: "Class 1", section: "A" });
  await Form.create({
    user: cust._id, step: 2, paymentStatus: "Pending", subscriptions: [], wallet: { points: 1000, history: [] },
    parentDetails: { fatherFirstName: "F", fatherLastName: "L", motherFirstName: "M", motherLastName: "L", mobile: "9876543210", email: "p@example.com", address: "x", pincode: "600017", city: "Chennai", state: "TN", country: "India" },
  });
  const token = signInToken({ _id: cust._id, name: cust.name, email: cust.email });
  const auth = { Authorization: `Bearer ${token}` };
  const adminDoc = await Admin.create({ name: { en: "Admin" }, email: "admin@example.com", password: "x", role: "Admin" });
  const adminAuth = { Authorization: `Bearer ${signInToken({ _id: adminDoc._id, name: "Admin", email: adminDoc.email })}` };
  const other = await Customer.create({ name: "Other", email: "o@example.com", phone: "9876500000" });
  const otherAuth = { Authorization: `Bearer ${signInToken({ _id: other._id, name: "O", email: other.email })}` };

  const respond = (pathname, fields) =>
    request(app).post(pathname).type("form").send({ encResp: ccav.encrypt(new URLSearchParams(fields).toString(), key) });
  const post = (p, body, h = auth) => request(app).post(p).set(h).send(body);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

  // Plan dates: start next Monday-ish working day, 22 working days
  const today = todayKeyIST();
  const start = nextWorkingDayKey(addDaysKey(today, 1), new Set());
  let endKey = start;
  for (let n = 1; n < 22; ) { endKey = addDaysKey(endKey, 1); if (countWorkingDays(endKey, endKey, new Set()) === 1) n++; }

  // ── 1. auth on customer routes ──
  let r = await request(app).post("/api/customer/Step-Check").send({ _id: String(cust._id) });
  assert.equal(r.status, 401, "no token → 401");
  r = await post("/api/customer/Step-Check", { _id: String(cust._id) }, otherAuth);
  assert.equal(r.status, 403, "other user's id → 403");
  r = await post("/api/customer/Step-Check", { _id: String(cust._id) });
  assert.equal(r.status, 200);
  r = await post("/api/customer/Step-Check", { _id: String(cust._id) }, adminAuth);
  assert.equal(r.status, 200, "admin may read any customer");

  // ── 2. step 3 creates a pending plan; it is invisible to calendar and kitchen ──
  r = await post("/api/customer/stepForm-Register", { _id: String(cust._id), path: "step-Form-SubscriptionPlan", step: 3,
    payload: { selectedPlan: "1", startDate: start, endDate: endKey, workingDays: 22, totalPrice: 4950, children: [String(child._id)] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let sub = await Subscription.findOne({ user: cust._id });
  assert.equal(sub.status, "pending_payment");
  // meals saved against the unpaid plan must not reach the kitchen
  await UserMeal.create({ userId: cust._id, plans: [{ planId: String(sub._id), children: [{ childId: child._id, meals: [{ mealDate: new Date(`${start}T00:00:00Z`), mealName: "Unpaid dish" }] }] }] });
  r = await request(app).get(`/api/orders/kitchen-sheet?date=${start}`).set(adminAuth);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 0, "unpaid plan meals excluded from kitchen");
  r = await request(app).get(`/api/orders/kitchen-sheet?date=${start}`);
  assert.equal(r.status, 401, "kitchen needs admin login");
  r = await post("/api/customer/get-Menu-Calendar", { _id: String(cust._id) });
  assert.ok(!(r.body.data || r.body.plans || []).some?.((p) => String(p.id || p._id) === String(sub._id)), "pending plan hidden from calendar");

  // ── 3. web checkout through /initiate ──
  r = await post("/api/ccavenue/initiate", { type: "subscription", source: "web" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.amount, 4950);
  assert.equal(r.body.data.type, "subscription");
  const subOrder = r.body.data.orderId;
  let intent = await PaymentIntent.findOne({ orderId: subOrder });
  assert.equal(intent.source, "web");
  assert.equal(intent.meta.plan.workingDays, 22, "plan snapshot stored on the intent");

  // tampered amount → not applied
  r = await respond("/api/ccavenue/response", { order_id: subOrder, order_status: "Success", amount: "1.00", merchant_param1: String(cust._id), tracking_id: "T0" });
  assert.equal(r.status, 302);
  assert.match(r.headers.location, /store\.test\/payment\/subscriptionFailed\?type=subscription&orderId=.*&reason=amount_mismatch/);
  assert.equal((await Subscription.findById(sub._id)).status, "pending_payment");
  assert.equal((await PaymentIntent.findOne({ orderId: subOrder })).status, "amount_mismatch");

  // a second, real attempt
  r = await post("/api/ccavenue/initiate", { type: "subscription", source: "web" });
  const subOrder2 = r.body.data.orderId;
  r = await respond("/api/ccavenue/response", { order_id: subOrder2, order_status: "Success", amount: "4950.00", merchant_param1: String(cust._id), tracking_id: "T1", payment_mode: "UPI" });
  assert.match(r.headers.location, /store\.test\/user\/menuCalendarPage\?payment=success&type=subscription&orderId=/);
  sub = await Subscription.findById(sub._id);
  assert.equal(sub.status, "active");
  assert.equal(sub.orderId, subOrder2);
  assert.equal(sub.transactionId, "T1");
  assert.equal(sub.paymentAmount, 4950);
  assert.equal(sub.payments.length, 1);
  let form = await Form.findOne({ user: cust._id });
  assert.equal(form.step, 4); assert.equal(form.paymentStatus, "Success"); assert.equal(form.subscriptionCount, 1);
  let up = await UserPayment.findOne({ user: cust._id });
  assert.equal(up.total_amount, 4950, "failed/mismatched attempts do not inflate totals");
  assert.equal(up.total_payments, 1);
  assert.equal(up.payments.length, 2, "both gateway results recorded (mismatch + success)");

  // replay of the success → nothing applied twice
  r = await respond("/api/ccavenue/response", { order_id: subOrder2, order_status: "Success", amount: "4950.00", merchant_param1: String(cust._id), tracking_id: "T1" });
  assert.match(r.headers.location, /payment=success/);
  form = await Form.findOne({ user: cust._id });
  assert.equal(form.subscriptionCount, 1);
  up = await UserPayment.findOne({ user: cust._id });
  assert.equal(up.payments.length, 2);

  // now the meals of the paid plan reach the kitchen
  r = await request(app).get(`/api/orders/kitchen-sheet?date=${start}`).set(adminAuth);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.schools[0].school, "S");
  r = await request(app).get(`/api/orders/kitchen-sheet?date=${start}&format=csv`).set(adminAuth);
  assert.match(r.text, /Unpaid dish/);

  // paying again for the first plan is refused
  r = await post("/api/ccavenue/initiate", { type: "subscription", source: "web" });
  assert.equal(r.status, 409);

  // ── 4. renewal with wallet: pending row deleted before a late callback → recreated from snapshot ──
  const renewStart = nextWorkingDayKey(addDaysKey(endKey, 1), new Set());
  r = await post("/api/customer/stepForm-Register", { _id: String(cust._id), path: "step-Form-Renew-SubscriptionPlan",
    payload: { selectedPlan: "1", startDate: renewStart, endDate: addDaysKey(renewStart, 30), workingDays: 22, totalPrice: 3950, walletUsed: 1000, children: [String(child._id)] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const renewSub = await Subscription.findOne({ user: cust._id, status: "pending_payment" });
  assert.equal(renewSub.walletUsed, 1000);
  r = await post("/api/ccavenue/initiate", { type: "renewal", source: "web" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.amount, 3950);
  assert.match(r.body.data.orderId, /^RENEW/);
  const renewOrder = r.body.data.orderId;
  // simulate the old cleanup having deleted the pending row
  await Subscription.deleteOne({ _id: renewSub._id });
  await Form.updateOne({ user: cust._id }, { $pull: { subscriptions: renewSub._id } });
  // callback never arrives; reconciliation (status API) settles it
  statusStub.enabled = true;
  statusStub.answers[renewOrder] = { ok: true, orderStatus: "Success", gatewayStatus: "Successful", trackingId: "UPI1", amount: 3950, paymentMode: "UPI", raw: {} };
  await PaymentIntent.updateOne({ orderId: renewOrder }, { $set: { createdAt: new Date(Date.now() - 10 * 60000) } }, { timestamps: false });
  const summary = await runReconcilePayments();
  assert.equal(summary.settled, 1, JSON.stringify(summary));
  intent = await PaymentIntent.findOne({ orderId: renewOrder });
  assert.equal(intent.status, "success"); assert.equal(intent.settledVia, "reconcile"); assert.equal(intent.trackingId, "UPI1");
  const recreated = await Subscription.findOne({ user: cust._id, orderId: renewOrder });
  assert.ok(recreated, "renewal plan recreated from the intent snapshot");
  assert.equal(recreated.status, "upcoming");
  assert.equal(recreated.workingDays, 22);
  form = await Form.findOne({ user: cust._id });
  assert.equal(form.wallet.points, 0, "wallet deducted server-side");
  assert.equal(form.subscriptions.map(String).includes(String(recreated._id)), true);
  // renewal refused while an upcoming plan exists
  r = await post("/api/customer/stepForm-Register", { _id: String(cust._id), path: "step-Form-Renew-SubscriptionPlan",
    payload: { selectedPlan: "1", startDate: renewStart, endDate: addDaysKey(renewStart, 30), workingDays: 22, totalPrice: 4950, walletUsed: 0, children: [String(child._id)] } });
  r = await post("/api/ccavenue/initiate", { type: "renewal", source: "web" });
  assert.equal(r.status, 409);
  await Subscription.deleteMany({ user: cust._id, status: "pending_payment" });

  // ── 5. add child: own payment record, replay creates no duplicate child ──
  const newChild = { childFirstName: "C", childLastName: "D", dob: "2019-05-05", lunchTime: "11:00 AM - 12:00 PM", school: "S", location: "L", childClass: "UKG", section: "B" };
  const countBeforeAddChild = (await Form.findOne({ user: cust._id })).subscriptionCount;
  r = await post("/api/ccavenue/initiate", { type: "addChild", subscriptionId: String(sub._id), children: [newChild], source: "web" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const addOrder = r.body.data.orderId; const addAmount = r.body.data.amount;
  r = await respond("/api/ccavenue/response/addChildPayment", { order_id: addOrder, order_status: "Success", amount: addAmount.toFixed(2), merchant_param1: String(cust._id), tracking_id: "T4" });
  assert.match(r.headers.location, /payment=success&type=addChild/);
  sub = await Subscription.findById(sub._id);
  assert.equal(sub.children.length, 2);
  assert.equal(sub.orderId, subOrder2, "plan's own order id untouched by add-child");
  assert.equal(sub.payments.length, 2);
  assert.equal((await Form.findOne({ user: cust._id })).subscriptionCount, countBeforeAddChild, "add-child is not a new subscription");
  r = await respond("/api/ccavenue/response/addChildPayment", { order_id: addOrder, order_status: "Success", amount: addAmount.toFixed(2), merchant_param1: String(cust._id), tracking_id: "T4" });
  assert.equal(await Child.countDocuments({ user: cust._id }), 2, "replay creates no duplicate child");

  // ── 6. holiday: mismatch / aborted / success; works with no UserMeal doc ──
  await UserMeal.deleteMany({ userId: cust._id });
  // pick the first Saturday inside the plan
  let sat = start; while (new Date(`${sat}T00:00:00Z`).getUTCDay() !== 6) sat = addDaysKey(sat, 1);
  const holBody = { type: "holiday", subscriptionId: String(sub._id), date: sat, children: [{ childId: String(child._id), mealName: "Idli" }], source: "web" };
  r = await post("/api/ccavenue/initiate", holBody);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.amount, 225);
  r = await respond("/api/ccavenue/response/holiydayPayment", { order_id: r.body.data.orderId, order_status: "Aborted", amount: "225.00", merchant_param1: String(cust._id) });
  assert.match(r.headers.location, /store\.test\/payment\/failed\?type=holiday/);
  assert.equal(await HolidayPayment.countDocuments(), 0);
  r = await post("/api/ccavenue/initiate", holBody);
  const holOrder = r.body.data.orderId;
  r = await respond("/api/ccavenue/response/holiydayPayment", { order_id: holOrder, order_status: "Success", amount: "225.00", merchant_param1: String(cust._id), tracking_id: "T5" });
  assert.match(r.headers.location, /store\.test\/payment\/success\?type=holiday/);
  const hp = await HolidayPayment.findOne();
  assert.equal(hp.amount, 225); assert.equal(hp.mealDate, sat);
  const um = await UserMeal.findOne({ userId: cust._id });
  assert.equal(um.plans[0].children[0].meals[0].mealName, "Idli", "meal booked even when the plan had no saved meals");
  r = await request(app).get(`/api/orders/kitchen-sheet?date=${sat}`).set(adminAuth);
  assert.equal(r.body.schools[0].slots[0].rows[0].holidayPaid, true);

  // ── 7. legacy website callback (no intent) still settles, once ──
  const other2 = await Customer.create({ name: "Legacy", email: "l@example.com", phone: "9876511111" });
  const lchild = await Child.create({ user: other2._id, childFirstName: "L", childLastName: "K", dob: new Date("2018-01-01"), lunchTime: "11:00 AM - 12:00 PM", school: "S", location: "L", childClass: "Class 1", section: "A" });
  const lsub = await Subscription.create({ user: other2._id, planId: "1", startDate: start, endDate: endKey, workingDays: 22, price: 4950, status: "pending_payment", children: [lchild._id] });
  await Form.create({ user: other2._id, step: 3, paymentStatus: "Pending", subscriptions: [lsub._id], wallet: { points: 0, history: [] },
    parentDetails: { fatherFirstName: "F", fatherLastName: "L", motherFirstName: "M", motherLastName: "L", mobile: "9876511111", email: "l@example.com", address: "x", pincode: "600017", city: "Chennai", state: "TN", country: "India" } });
  r = await respond("/api/ccavenue/response", { order_id: "LB1700000000000123", order_status: "Success", amount: "4950.00", merchant_param1: String(other2._id), merchant_param2: "1", tracking_id: "W1" });
  assert.equal(r.headers.location, "https://store.test/user/menuCalendarPage?payment=success&type=subscription&orderId=LB1700000000000123");
  assert.equal((await Subscription.findById(lsub._id)).status, "active");
  assert.equal((await PaymentIntent.findOne({ orderId: "LB1700000000000123" })).source, "legacy");
  r = await respond("/api/ccavenue/response", { order_id: "LB1700000000000123", order_status: "Success", amount: "4950.00", merchant_param1: String(other2._id), tracking_id: "W1" });
  assert.equal((await Form.findOne({ user: other2._id })).subscriptionCount, 1);
  // legacy holiday + add-child shapes
  r = await respond("/api/ccavenue/response/holiydayPayment", { order_id: "LB-HOLIDAY-web1", order_status: "Success", amount: "225.00", merchant_param1: String(other2._id), merchant_param2: sat, merchant_param3: b64([{ childId: String(lchild._id), dish: { mealName: "Poha" }, mealDate: sat, planId: String(lsub._id) }]) });
  assert.match(r.headers.location, /payment\/success\?type=holiday/);
  assert.equal(await HolidayPayment.countDocuments({ userId: other2._id }), 1);
  r = await respond("/api/ccavenue/response/addChildPayment", { order_id: "LBweb3", order_status: "Success", amount: "100.00", merchant_param1: String(other2._id), merchant_param2: String(lsub._id), merchant_param3: b64([{ ...newChild, dob: "05/05/2019" }]) });
  assert.match(r.headers.location, /type=addChild/);
  assert.equal((await Subscription.findById(lsub._id)).children.length, 2);
  // legacy callbacks can be switched off
  process.env.CCAV_ACCEPT_LEGACY_CALLBACKS = "false";
  r = await respond("/api/ccavenue/response", { order_id: "LB1700000000000999", order_status: "Success", amount: "4950.00", merchant_param1: String(other2._id) });
  assert.equal(r.status, 400);
  delete process.env.CCAV_ACCEPT_LEGACY_CALLBACKS;

  // ── 8. admin payments: unreconciled list, manual confirm, retry-apply, expiry ──
  const other3 = await Customer.create({ name: "Manual", email: "m@example.com", phone: "9876522222" });
  const mchild = await Child.create({ user: other3._id, childFirstName: "M", childLastName: "K", dob: new Date("2018-01-01"), lunchTime: "11:00 AM - 12:00 PM", school: "S", location: "L", childClass: "Class 1", section: "A" });
  const msub = await Subscription.create({ user: other3._id, planId: "1", startDate: start, endDate: endKey, workingDays: 22, price: 4950, status: "pending_payment", children: [mchild._id] });
  await Form.create({ user: other3._id, step: 3, paymentStatus: "Pending", subscriptions: [msub._id], wallet: { points: 0, history: [] },
    parentDetails: { fatherFirstName: "F", fatherLastName: "L", motherFirstName: "M", motherLastName: "L", mobile: "9876522222", email: "m@example.com", address: "x", pincode: "600017", city: "Chennai", state: "TN", country: "India" } });
  const mToken = { Authorization: `Bearer ${signInToken({ _id: other3._id, name: "M", email: "m@example.com" })}` };
  r = await post("/api/ccavenue/initiate", { type: "subscription", source: "web" }, mToken);
  const mOrder = r.body.data.orderId;
  await PaymentIntent.updateOne({ orderId: mOrder }, { $set: { createdAt: new Date(Date.now() - 40 * 60000) } }, { timestamps: false });
  statusStub.enabled = false;
  const s2 = await runReconcilePayments();
  assert.equal(s2.alerted, 1, "stale intent alerted to admin");
  r = await request(app).get("/api/admin-ops/payments?status=unreconciled").set(adminAuth);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.some((i) => i.orderId === mOrder));
  r = await request(app).get("/api/admin-ops/payments?status=unreconciled").set(auth);
  assert.equal(r.status, 403, "customers cannot see admin payments");
  r = await request(app).post(`/api/admin-ops/payments/${mOrder}/confirm`).set(adminAuth).send({ trackingId: "CCAV-DASH-1", note: "Seen in CCAvenue dashboard" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "success");
  assert.equal((await Subscription.findById(msub._id)).status, "active");
  assert.equal((await PaymentIntent.findOne({ orderId: mOrder })).settledVia, "manual");
  r = await request(app).post(`/api/admin-ops/payments/${mOrder}/confirm`).set(adminAuth).send({ trackingId: "x", note: "again" });
  assert.equal(r.status, 409, "cannot confirm twice");
  // paid-but-unapplied: intent whose plan vanished and has no snapshot → applyError, then retry after fixing
  const broken = await PaymentIntent.create({ orderId: "RENEWBROKEN1", user: other3._id, type: "renewal", amount: 100, source: "web", meta: {} });
  r = await respond("/api/ccavenue/response", { order_id: "RENEWBROKEN1", order_status: "Success", amount: "100.00", merchant_param1: String(other3._id), tracking_id: "TB" });
  const bi = await PaymentIntent.findOne({ orderId: "RENEWBROKEN1" });
  assert.equal(bi.status, "success"); assert.ok(bi.applyError, "money kept, apply error recorded");
  r = await request(app).get("/api/admin-ops/payments?status=attention").set(adminAuth);
  assert.ok(r.body.data.some((i) => i.orderId === "RENEWBROKEN1"));
  await Subscription.create({ user: other3._id, planId: "1", startDate: start, endDate: endKey, workingDays: 22, price: 100, status: "pending_payment", children: [] }).then((s) => Form.updateOne({ user: other3._id }, { $push: { subscriptions: s._id } }));
  r = await request(app).post("/api/admin-ops/payments/RENEWBROKEN1/retry-apply").set(adminAuth);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await PaymentIntent.findOne({ orderId: "RENEWBROKEN1" })).applyError, undefined);
  // expiry of very old intents
  await PaymentIntent.create({ orderId: "LBOLD1", user: other3._id, type: "subscription", amount: 10, source: "web", meta: {}, createdAt: new Date(Date.now() - 100 * 3600 * 1000) });
  await PaymentIntent.updateOne({ orderId: "LBOLD1" }, { $set: { createdAt: new Date(Date.now() - 100 * 3600 * 1000) } }, { timestamps: false });
  const s3 = await runReconcilePayments();
  assert.equal((await PaymentIntent.findOne({ orderId: "LBOLD1" })).status, "expired");

  // ── 9. test-only routes closed on live, open in test mode and settle through the same path ──
  r = await request(app).post("/api/ccavenue/local-success").send({ userId: String(cust._id), orderId: "LBX" });
  assert.equal(r.status, 404);
  process.env.ALLOW_LOCAL_PAYMENTS = "true";
  const other4 = await Customer.create({ name: "Local", email: "loc@example.com", phone: "9876533333" });
  const lsub4 = await Subscription.create({ user: other4._id, planId: "1", startDate: start, endDate: endKey, workingDays: 22, price: 4950, status: "pending_payment", children: [] });
  await Form.create({ user: other4._id, step: 3, paymentStatus: "Pending", subscriptions: [lsub4._id], wallet: { points: 0, history: [] },
    parentDetails: { fatherFirstName: "F", fatherLastName: "L", motherFirstName: "M", motherLastName: "L", mobile: "9876533333", email: "loc@example.com", address: "x", pincode: "600017", city: "Chennai", state: "TN", country: "India" } });
  r = await request(app).post("/api/customer/local-success").send({ userId: String(other4._id), orderId: "LBLOCAL1", transactionId: "TT" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await Subscription.findById(lsub4._id)).status, "active");
  delete process.env.ALLOW_LOCAL_PAYMENTS;

  console.log("ALL PAYMENT INTEGRATION CHECKS PASSED");
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
