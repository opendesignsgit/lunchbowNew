/**
 * Integration checks for /api/admin-ops, the notification bus and the jobs.
 * Not part of `npm test` (needs a MongoDB at 127.0.0.1:27017):
 *
 *   node test/integration/adminOps.int.js
 *
 * Mail and SMS are stubbed; nothing leaves the machine. Uses a unique DB per run and drops it.
 */
const path = require("path");
const BE = path.resolve(__dirname, "../..");
const ITEST = "/tmp/claude-0/-home-user/188222d3-9adc-5188-aa5c-3c2c99b06b3f/scratchpad/itest";
const beRequire = (m) => require(require.resolve(m, { paths: [BE] }));
const extRequire = (m) => require(require.resolve(m, { paths: [ITEST, BE] }));

process.env.JWT_SECRET = "test-secret";
process.env.EMAIL_USER = "noreply@example.com";
process.env.EMAIL_PASS = "x";
process.env.JOBS_SECRET = "jobs-secret";
process.env.RUN_CRON = "false";
process.env.ADMIN_NOTIFY_EMAILS = "ops@example.com";
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Stub mail + SMS so nothing leaves the machine.
const mails = [];
const nm = beRequire("nodemailer");
nm.createTransport = () => ({
  sendMail: (o, cb) => {
    mails.push(o);
    return cb ? cb(null, {}) : Promise.resolve({});
  },
  verify: (cb) => (cb ? cb(null, true) : Promise.resolve(true)),
});
const smsSent = [];
const smsPath = require.resolve(path.join(BE, "lib/sms-sender/smsService"));
require.cache[smsPath] = {
  id: smsPath,
  filename: smsPath,
  loaded: true,
  exports: {
    sendSMS: async (mobile, messageType, variables) => {
      smsSent.push({ mobile, messageType, variables });
      return { success: true, message: "stub", templateId: "t", messageId: "m1" };
    },
    validateMobile: () => true,
    formatMobile: (m) => m,
    SMS_TEMPLATES: {},
  },
};

const request = extRequire("supertest");
const assert = require("assert/strict");

(async () => {
  const mongoose = beRequire("mongoose");
  const dbName = "lb_adminops_" + Date.now();
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false });

  const express = beRequire("express");
  const { isAuth } = require(path.join(BE, "config/auth"));
  const isAdminUser = require(path.join(BE, "middleware/isAdminUser"));
  const app = express();
  app.use(express.json());
  app.use("/api/admin-ops/", isAuth, isAdminUser, require(path.join(BE, "routes/adminOpsRoutes")));
  app.use("/api/jobs/", require(path.join(BE, "routes/jobsRoutes")));
  app.use("/api/customer/", require(path.join(BE, "routes/customerRoutes")));
  app.use("/api/admin/", require(path.join(BE, "routes/adminRoutes")));
  app.use("/api/app-config/", require(path.join(BE, "routes/appSettingsRoutes")));
  app.use("/api/", require(path.join(BE, "routes/schoolRequestRoutes")));

  const Admin = require(path.join(BE, "models/Admin"));
  const Customer = require(path.join(BE, "models/Customer"));
  const Form = require(path.join(BE, "models/Form"));
  const Child = require(path.join(BE, "models/childModel"));
  const Subscription = require(path.join(BE, "models/subscriptionModel"));
  const UserMeal = require(path.join(BE, "models/UserMeal"));
  const AdminNotification = require(path.join(BE, "models/AdminNotification"));
  const AuditLog = require(path.join(BE, "models/AuditLog"));
  const ReminderLog = require(path.join(BE, "models/ReminderLog"));
  const Enquiry = require(path.join(BE, "models/Enquiry"));
  const SmsLog = require(path.join(BE, "models/SmsLog"));
  const { signInToken } = require(path.join(BE, "config/auth"));
  const settingsStore = require(path.join(BE, "lib/settingsStore"));
  const { getPricingConfig, todayKeyIST, addDaysKey, toDateKey } = require(path.join(BE, "lib/pricing"));
  const { notifyAdmin } = require(path.join(BE, "lib/notify"));
  const { runRenewalReminders } = require(path.join(BE, "jobs/renewalReminder"));
  const { runMealReminders } = require(path.join(BE, "jobs/mealReminder"));
  const scheduler = require(path.join(BE, "jobs/scheduler"));

  const d = (key) => new Date(`${key}T00:00:00Z`);
  const today = todayKeyIST();
  await settingsStore.load();

  // ── Fixtures ───────────────────────────────────────────────────────────────
  const adminDoc = await Admin.create({ name: { en: "Ops Admin" }, email: "ops@test.com", role: "Admin" });
  const admin = { Authorization: `Bearer ${signInToken({ _id: adminDoc._id, name: "Ops", email: adminDoc.email })}` };

  const parentDetails = (mobile, email) => ({
    fatherFirstName: "Ravi", fatherLastName: "Kumar", motherFirstName: "Priya", motherLastName: "Kumar",
    mobile, email, address: "1 Main St", pincode: "600017", city: "Chennai", state: "TN", country: "India",
  });
  const cust = await Customer.create({ name: "Test Parent", email: "p1@example.com", phone: "9876543210" });
  const child = await Child.create({ user: cust._id, childFirstName: "Aarav", childLastName: "K", dob: new Date("2018-01-01"), lunchTime: "11:00 AM - 12:00 PM", school: "DAV", location: "Adyar", childClass: "Class 1", section: "A" });
  const child2 = await Child.create({ user: cust._id, childFirstName: "Diya", childLastName: "K", dob: new Date("2019-01-01"), lunchTime: "11:00 AM - 12:00 PM", school: "DAV", location: "Adyar", childClass: "LKG", section: "B" });
  const sub = await Subscription.create({ user: cust._id, planId: "1", startDate: d(addDaysKey(today, -20)), endDate: d(addDaysKey(today, 2)), workingDays: 22, price: 4950, status: "active", children: [child._id] });
  const upcoming = await Subscription.create({ user: cust._id, planId: "1", startDate: d(addDaysKey(today, 3)), endDate: d(addDaysKey(today, 33)), workingDays: 22, price: 4950, status: "upcoming", children: [child._id] });
  await Form.create({ user: cust._id, step: 4, paymentStatus: "Success", subscriptionCount: 1, subscriptions: [sub._id, upcoming._id], wallet: { points: 100, history: [] }, parentDetails: parentDetails("9876543210", "p1@example.com") });
  const custToken = { Authorization: `Bearer ${signInToken({ _id: cust._id, name: cust.name, email: cust.email })}` };

  // Second customer: active plan ending in 3 days, no upcoming plan → renewal candidate
  const cust2 = await Customer.create({ name: "Renewal Parent", email: "p2@example.com", phone: "9000000002" });
  const child3 = await Child.create({ user: cust2._id, childFirstName: "Kabir", childLastName: "S", dob: new Date("2018-05-05"), lunchTime: "11:00 AM - 12:00 PM", school: "PSBB", location: "KK Nagar", childClass: "Class 2", section: "C" });
  const sub2 = await Subscription.create({ user: cust2._id, planId: "1", startDate: d(addDaysKey(today, -19)), endDate: d(addDaysKey(today, 3)), workingDays: 22, price: 4950, status: "active", children: [child3._id] });
  await Form.create({ user: cust2._id, step: 4, paymentStatus: "Success", subscriptionCount: 1, subscriptions: [sub2._id], wallet: { points: 0, history: [] }, parentDetails: parentDetails("9000000002", "p2@example.com") });

  let r;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  r = await request(app).get("/api/admin-ops/settings"); assert.equal(r.status, 401);
  r = await request(app).get("/api/admin-ops/settings").set(custToken); assert.equal(r.status, 403, "customer token is not an admin");

  // ── 1. Settings ────────────────────────────────────────────────────────────
  r = await request(app).get("/api/admin-ops/settings").set(admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.effective.pricePerDayPerChild, 225);
  assert.deepEqual(r.body.data.overrides, {});
  assert.ok(r.body.data.notificationEvents.length >= 19);

  r = await request(app).put("/api/admin-ops/settings").set(admin).send({ walletMaxRedeemPercent: 150 });
  assert.equal(r.status, 400); assert.match(r.body.errors[0], /walletMaxRedeemPercent/);
  r = await request(app).put("/api/admin-ops/settings").set(admin).send({ bogus: 1 });
  assert.equal(r.status, 400);

  r = await request(app).put("/api/admin-ops/settings").set(admin).send({
    pricePerDayPerChild: 250, planDurations: { oneMonth: 20 }, renewalReminderDays: [5, 3, 1], trialEnabled: true,
    adminNotifyEmails: ["alerts@example.com"], notificationChannels: { "user.signup": ["email"] }, reason: "price revision",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.effective.pricePerDayPerChild, 250);
  assert.equal(r.body.data.effective.planDurations.oneMonth, 20);
  assert.equal(r.body.data.effective.planDurations.threeMonths, 66, "untouched nested keys keep env defaults");
  assert.equal(getPricingConfig().pricePerDayPerChild, 250, "override visible synchronously in getPricingConfig");
  assert.deepEqual(getPricingConfig().renewalReminderDays, [5, 3, 1]);
  r = await request(app).get("/api/app-config");
  assert.equal(r.body.data.pricePerDayPerChild, 250);
  assert.equal(r.body.data.trialEnabled, true);
  assert.equal(r.body.data.adminNotifyEmails, undefined, "private keys are not public");
  assert.equal(await AuditLog.countDocuments({ action: "settings.update" }), 1);

  // user.signup now routes to email (settings override) + dashboard
  const mailsBefore = mails.length;
  let n = await notifyAdmin({ type: "user.signup", title: "t", message: "m", userId: cust._id });
  assert.deepEqual(Array.from(n.channels), ["email", "dashboard"]);
  assert.equal(mails.length, mailsBefore + 1);
  assert.deepEqual(mails[mails.length - 1].to, ["alerts@example.com"], "adminNotifyEmails setting is used");

  // remove the price override again
  r = await request(app).put("/api/admin-ops/settings").set(admin).send({ pricePerDayPerChild: null, notificationChannels: null, adminNotifyEmails: null });
  assert.equal(r.status, 200);
  assert.equal(getPricingConfig().pricePerDayPerChild, 225);
  assert.equal(getPricingConfig().planDurations.oneMonth, 20);

  // ── 2. Notification bus ────────────────────────────────────────────────────
  await AdminNotification.deleteMany({});
  const before = mails.length;
  n = await notifyAdmin({ type: "payment.mismatch", message: "Order X paid 1 instead of 4950", userId: cust._id, meta: { orderId: "X" } });
  assert.equal(n.severity, "critical");
  assert.equal(n.title, "Payment amount mismatch");
  assert.deepEqual(Array.from(n.channels), ["dashboard", "email", "push"]);
  assert.equal(mails.length, before + 1);
  assert.match(mails[mails.length - 1].subject, /CRITICAL/);
  assert.deepEqual(mails[mails.length - 1].to, ["ops@example.com"]);
  assert.equal((await AdminNotification.findById(n._id)).emailed, true);
  assert.equal((await AdminNotification.findById(n._id)).pushed, false, "push is a no-op without Firebase");
  await notifyAdmin({ type: "user.signup", title: "New signup", message: "second", userId: cust._id });
  assert.equal(mails.length, before + 1, "info events are not emailed immediately");
  assert.equal(await notifyAdmin(null), null);

  r = await request(app).get("/api/admin-ops/notifications/unread-count").set(admin);
  assert.equal(r.body.count, 2);
  r = await request(app).get("/api/admin-ops/notifications?unread=1").set(admin);
  assert.equal(r.body.total, 2); assert.equal(r.body.data[0].read, false);
  r = await request(app).get("/api/admin-ops/notifications?type=payment.mismatch").set(admin);
  assert.equal(r.body.total, 1);
  r = await request(app).put(`/api/admin-ops/notifications/${n._id}/read`).set(admin);
  assert.equal(r.status, 200); assert.equal(r.body.data.read, true);
  r = await request(app).get("/api/admin-ops/notifications/unread-count").set(admin);
  assert.equal(r.body.count, 1);
  r = await request(app).put("/api/admin-ops/notifications/read-all").set(admin);
  assert.equal(r.body.updated, 1);
  r = await request(app).get("/api/admin-ops/notifications/unread-count").set(admin);
  assert.equal(r.body.count, 0);
  r = await request(app).put("/api/admin-ops/notifications/nope/read").set(admin); assert.equal(r.status, 400);

  // devices
  r = await request(app).post("/api/admin-ops/devices").set(admin).send({ token: "fcm-token-1234567890", platform: "android" });
  assert.equal(r.status, 200); assert.equal(String(r.body.data.adminId), String(adminDoc._id));
  r = await request(app).post("/api/admin-ops/devices").set(admin).send({ token: "fcm-token-1234567890", platform: "ios" });
  assert.equal(r.body.data.platform, "ios", "upsert by token");
  r = await request(app).delete("/api/admin-ops/devices/fcm-token-1234567890").set(admin);
  assert.equal(r.body.deleted, 1);

  // digest job picks up the un-emailed info notifications
  const digestBefore = mails.length;
  r = await request(app).post("/api/jobs/adminDigest").set("x-jobs-secret", "jobs-secret");
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.result.count, 1);
  assert.equal(mails.length, digestBefore + 1); assert.match(mails[mails.length - 1].subject, /Daily digest/);
  assert.equal(await AdminNotification.countDocuments({ emailed: false }), 0);

  // ── 3. Customers ───────────────────────────────────────────────────────────
  r = await request(app).get("/api/admin-ops/customers?q=Test").set(admin);
  assert.equal(r.status, 200); assert.equal(r.body.total, 1);
  let row = r.body.data[0];
  assert.equal(row.childrenCount, 2); assert.equal(row.step, 4); assert.equal(row.walletPoints, 100);
  assert.equal(row.activePlan.endDateKey, addDaysKey(today, 2)); assert.ok(row.upcomingPlan);
  r = await request(app).get("/api/admin-ops/customers?q=Ravi").set(admin);
  assert.equal(r.body.total, 2, "search matches Form.parentDetails too");
  r = await request(app).get("/api/admin-ops/customers?q=9000000002").set(admin);
  assert.equal(r.body.total, 1); assert.equal(r.body.data[0].name, "Renewal Parent");
  r = await request(app).get("/api/admin-ops/customers?limit=1").set(admin);
  assert.equal(r.body.total, 2); assert.equal(r.body.data.length, 1); assert.equal(r.body.totalPages, 2);

  await UserMeal.create({ userId: cust._id, plans: [{ planId: String(sub._id), children: [{ childId: child._id, meals: [{ mealDate: d(addDaysKey(today, 1)), mealName: "Dosa" }, { mealDate: d(addDaysKey(today, -2)), mealName: "Idli", deleted: true }] }] }] });
  r = await request(app).get(`/api/admin-ops/customers/${cust._id}/overview`).set(admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.user.name, "Test Parent");
  assert.equal(r.body.data.form.wallet.points, 100);
  assert.equal(r.body.data.children.length, 2);
  assert.equal(r.body.data.subscriptions.length, 2);
  const activeView = r.body.data.subscriptions.find((s) => s.status === "active");
  assert.equal(activeView.children[0].childFirstName, "Aarav", "children populated");
  assert.deepEqual({ booked: activeView.meals.booked, deleted: activeView.meals.deleted }, { booked: 1, deleted: 1 });
  assert.equal(activeView.meals.next7Days.length, 1);
  assert.deepEqual(r.body.data.payments, []); assert.deepEqual(r.body.data.paymentIntents, []);
  assert.equal(r.body.data.smsLogCount, 0);
  assert.equal(r.body.data.notifications.length, 2);
  r = await request(app).get(`/api/admin-ops/customers/${adminDoc._id}/overview`).set(admin); assert.equal(r.status, 404);

  // ── 4. Subscription edit / create + audit ──────────────────────────────────
  r = await request(app).put(`/api/admin-ops/subscriptions/${sub._id}`).set(admin).send({ endDate: addDaysKey(today, 5) });
  assert.equal(r.status, 400, "reason required");
  r = await request(app).put(`/api/admin-ops/subscriptions/${sub._id}`).set(admin).send({ endDate: addDaysKey(today, -30), reason: "x" });
  assert.equal(r.status, 400, "endDate before startDate");
  r = await request(app).put(`/api/admin-ops/subscriptions/${sub._id}`).set(admin).send({ children: [String(child3._id)], reason: "x" });
  assert.equal(r.status, 400, "child of another user");
  r = await request(app).put(`/api/admin-ops/subscriptions/${sub._id}`).set(admin).send({ status: "pending_payment", reason: "x" });
  assert.equal(r.status, 400);
  r = await request(app).put(`/api/admin-ops/subscriptions/${sub._id}`).set(admin).send({ endDate: addDaysKey(today, 5), children: [String(child._id), String(child2._id)], workingDays: 25, reason: "extended for holidays" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.endDateKey, addDaysKey(today, 5)); assert.equal(r.body.data.children.length, 2); assert.equal(r.body.data.workingDays, 25);
  assert.equal(toDateKey((await Subscription.findById(sub._id)).endDate), addDaysKey(today, 5));
  let audit = await AuditLog.findOne({ action: "subscription.update", targetId: String(sub._id) }).lean();
  assert.ok(audit); assert.equal(audit.reason, "extended for holidays"); assert.equal(String(audit.adminId), String(adminDoc._id));
  assert.equal(audit.before.endDateKey, addDaysKey(today, 2)); assert.equal(audit.after.endDateKey, addDaysKey(today, 5));
  assert.equal(await AdminNotification.countDocuments({ type: "admin.override", userId: cust._id }), 1);
  r = await request(app).get(`/api/admin-ops/audit?targetType=Subscription&targetId=${sub._id}`).set(admin);
  assert.equal(r.body.total, 1); assert.equal(r.body.data[0].adminId.email, "ops@test.com");

  r = await request(app).post("/api/admin-ops/subscriptions").set(admin).send({ userId: String(cust2._id), planId: "1", startDate: addDaysKey(today, 4), endDate: addDaysKey(today, 34), workingDays: 22, price: 4950, children: [String(child3._id)], status: "upcoming", note: "orphan repair" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const manualId = r.body.data._id;
  const form2 = await Form.findOne({ user: cust2._id });
  assert.ok(form2.subscriptions.map(String).includes(manualId)); assert.equal(form2.subscriptionCount, 2);
  assert.equal(await AuditLog.countDocuments({ action: "subscription.create" }), 1);
  await Subscription.deleteOne({ _id: manualId }); // keep cust2 a renewal candidate below
  await Form.updateOne({ user: cust2._id }, { $pull: { subscriptions: manualId } });

  // ── 5. Wallet ──────────────────────────────────────────────────────────────
  r = await request(app).post(`/api/admin-ops/wallet/${cust._id}/adjust`).set(admin).send({ change: 50 });
  assert.equal(r.status, 400, "reason required");
  r = await request(app).post(`/api/admin-ops/wallet/${cust._id}/adjust`).set(admin).send({ change: -500, reason: "oops" });
  assert.equal(r.status, 400, "cannot go negative");
  r = await request(app).post(`/api/admin-ops/wallet/${cust._id}/adjust`).set(admin).send({ change: 50, reason: "goodwill" });
  assert.equal(r.status, 200); assert.equal(r.body.data.points, 150);
  let form = await Form.findOne({ user: cust._id });
  assert.equal(form.wallet.points, 150); assert.equal(form.wallet.history.length, 1); assert.equal(form.wallet.history[0].reason, "goodwill");
  r = await request(app).post(`/api/admin-ops/wallet/${cust._id}/adjust`).set(admin).send({ change: -200, reason: "clawback", allowNegative: true });
  assert.equal(r.status, 200); assert.equal(r.body.data.points, -50);
  await Form.updateOne({ user: cust._id }, { $set: { "wallet.points": 0 } });
  assert.equal(await AuditLog.countDocuments({ action: "wallet.adjust" }), 2);

  // ── 6. Meal override ───────────────────────────────────────────────────────
  const futureKey = addDaysKey(today, 1);
  const ov = (body) => request(app).post("/api/admin-ops/meals/override").set(admin).send({ userId: String(cust._id), subscriptionId: String(sub._id), childId: String(child2._id), date: futureKey, reason: "parent called", ...body });
  r = await ov({ action: "set" }); assert.equal(r.status, 400, "mealName required");
  r = await ov({ action: "delete" }); assert.equal(r.status, 404, "nothing booked yet for child2");
  r = await ov({ action: "set", mealName: "Poha" }); assert.equal(r.status, 200, JSON.stringify(r.body));
  let um = await UserMeal.findOne({ userId: cust._id });
  let entry = um.plans[0].children.find((c) => String(c.childId) === String(child2._id));
  assert.equal(entry.meals.length, 1); assert.equal(entry.meals[0].mealName, "Poha"); assert.equal(toDateKey(entry.meals[0].mealDate), futureKey);
  r = await ov({ action: "set", mealName: "Upma" }); assert.equal(r.status, 200);
  um = await UserMeal.findOne({ userId: cust._id });
  entry = um.plans[0].children.find((c) => String(c.childId) === String(child2._id));
  assert.equal(entry.meals.length, 1, "set on an existing date replaces, never duplicates"); assert.equal(entry.meals[0].mealName, "Upma");
  // today's date would be refused for customers; admin may override
  r = await ov({ action: "set", mealName: "Curd rice", date: today }); assert.equal(r.status, 200);
  r = await ov({ action: "delete", creditWallet: true }); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.meal.deleted, true); assert.equal(r.body.data.wallet.change, 225);
  form = await Form.findOne({ user: cust._id });
  assert.equal(form.wallet.points, 225); assert.equal(form.wallet.history[form.wallet.history.length - 1].childName, "Diya K");
  r = await ov({ action: "delete" }); assert.equal(r.status, 409);
  r = await ov({ action: "restore", creditWallet: true }); assert.equal(r.status, 200);
  assert.equal(r.body.data.meal.deleted, false); assert.equal(r.body.data.wallet.change, -225);
  assert.equal((await Form.findOne({ user: cust._id })).wallet.points, 0);
  r = await ov({ action: "restore" }); assert.equal(r.status, 409);
  r = await ov({ action: "delete", childId: String(child3._id) }); assert.equal(r.status, 404, "child of another user");
  assert.equal(await AuditLog.countDocuments({ action: /^meal\./ }), 5);

  // customer meal save → one throttled meal.updated notification
  const save = (mealDate, mealName) => request(app).post("/api/customer/save-Menu-Calendar").set(custToken).send({ data: { userId: String(cust._id), planId: String(sub._id), children: [{ childId: String(child._id), meals: [{ mealDate, mealName, deleted: false }] }] } });
  r = await save(addDaysKey(today, 2), "Dosa"); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await save(addDaysKey(today, 3), "Idli"); assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(await AdminNotification.countDocuments({ type: "meal.updated" }), 1, "throttled to one per 10 minutes");

  // ── 7. Renewals list ───────────────────────────────────────────────────────
  r = await request(app).get("/api/admin-ops/renewals?days=10").set(admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.length, 1, "cust1 has an upcoming plan and is excluded");
  assert.equal(String(r.body.data[0].user), String(cust2._id));
  assert.equal(r.body.data[0].daysLeft, 3);
  assert.equal(r.body.data[0].parent.phone, "9000000002");
  assert.equal(r.body.data[0].children[0].childFirstName, "Kabir");
  assert.deepEqual(r.body.data[0].remindersSent, []);
  r = await request(app).get("/api/admin-ops/renewals?days=2").set(admin);
  assert.equal(r.body.data.length, 0);

  // ── 8. Renewal reminder job (idempotent) ───────────────────────────────────
  const remMails = mails.length; const remSms = smsSent.length;
  let summary = await runRenewalReminders(); // settings.renewalReminderDays = [5,3,1] → sub2 ends in 3 days
  assert.equal(summary.emails, 1); assert.equal(summary.sms, 1);
  assert.equal(mails.length, remMails + 1); assert.equal(mails[mails.length - 1].to, "p2@example.com");
  assert.equal(smsSent.length, remSms + 1); assert.equal(smsSent[smsSent.length - 1].messageType, "SUBSCRIPTION_RENEWAL");
  assert.equal(smsSent[smsSent.length - 1].variables[0], "Ravi Kumar");
  assert.equal(await ReminderLog.countDocuments({ subscriptionId: sub2._id, kind: "renewal", daysBefore: 3 }), 2);
  assert.equal(await SmsLog.countDocuments({ customerId: cust2._id, messageType: "SUBSCRIPTION_RENEWAL" }), 1);
  summary = await runRenewalReminders();
  assert.equal(summary.emails, 0); assert.equal(summary.sms, 0); assert.equal(summary.skipped, 2);
  assert.equal(mails.length, remMails + 1, "no double send"); assert.equal(smsSent.length, remSms + 1);
  assert.equal(await ReminderLog.countDocuments({ kind: "renewal" }), 2);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(await AdminNotification.countDocuments({ type: "reminder.renewal.sent" }), 1);
  r = await request(app).get("/api/admin-ops/renewals?days=10").set(admin);
  assert.equal(r.body.data[0].remindersSent.length, 2);
  r = await request(app).get(`/api/admin-ops/sms-logs?customerId=${cust2._id}`).set(admin);
  assert.equal(r.body.total, 1); assert.equal(r.body.data[0].customerId.name, "Renewal Parent");

  // meal reminder: cust2 has no meal for the next working day → one email, then skipped
  const mealMails = mails.length;
  summary = await runMealReminders();
  assert.ok(summary.emails >= 1, JSON.stringify(summary));
  assert.ok(mails.slice(mealMails).some((m) => m.to === "p2@example.com" && /Pick tomorrow/.test(m.subject)));
  const afterFirst = mails.length;
  summary = await runMealReminders();
  assert.equal(summary.emails, 0); assert.equal(mails.length, afterFirst);

  // roll statuses: an active plan that ended yesterday is deactivated
  const old = await Subscription.create({ user: cust2._id, planId: "1", startDate: d(addDaysKey(today, -40)), endDate: d(addDaysKey(today, -1)), workingDays: 22, price: 4950, status: "active", children: [child3._id] });
  r = await request(app).post("/api/jobs/rollSubscriptionStatuses").set("x-jobs-secret", "jobs-secret");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await Subscription.findById(old._id)).status, "deactivated");
  assert.equal((await Subscription.findById(sub2._id)).status, "active");

  // ── 9. School requests + enquiries ─────────────────────────────────────────
  r = await request(app).post("/api/request-school").send({ schoolName: "New School", location: "Velachery", parentName: "Meena", phone: "9111111111", email: "m@example.com" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  r = await request(app).get("/api/admin-ops/school-requests?status=pending").set(admin);
  assert.equal(r.body.total, 1); const sr = r.body.data[0];
  r = await request(app).put(`/api/admin-ops/school-requests/${sr._id}`).set(admin).send({ status: "bogus" }); assert.equal(r.status, 400);
  r = await request(app).put(`/api/admin-ops/school-requests/${sr._id}`).set(admin).send({ status: "approved", note: "onboarded" });
  assert.equal(r.status, 200); assert.equal(r.body.data.status, "approved");
  r = await request(app).get("/api/admin-ops/school-requests?status=pending").set(admin); assert.equal(r.body.total, 0);

  r = await request(app).post("/api/admin/contact-us").send({ firstname: "Anu", Lastname: "R", phone: "9222222222", email: "anu@example.com", message: "Do you deliver to Porur?" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await request(app).post("/api/admin/free-trial-enquiry").send({ firstName: "Vik", lastName: "S", email: "vik@example.com", mobileNumber: "9333333333", schoolName: "PSBB", className: "2", childName: "Tara", message: "trial please" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await request(app).post("/api/admin/get-school-enquiry").send({ firstName: "Sam", lastName: "P", mobileNumber: "9444444444", schoolName: "KV", message: "school tie-up" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await Enquiry.countDocuments({}), 3);
  r = await request(app).get("/api/admin-ops/enquiries?kind=contact-us").set(admin);
  assert.equal(r.body.total, 1); assert.equal(r.body.data[0].name, "Anu R"); assert.equal(r.body.data[0].status, "new");
  r = await request(app).put(`/api/admin-ops/enquiries/${r.body.data[0]._id}`).set(admin).send({ status: "contacted", note: "called" });
  assert.equal(r.status, 200); assert.equal(r.body.data.status, "contacted");
  r = await request(app).get("/api/admin-ops/enquiries?status=new").set(admin); assert.equal(r.body.total, 2);
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(await AdminNotification.countDocuments({ type: "school.requested" }), 1);
  assert.equal(await AdminNotification.countDocuments({ type: "enquiry.contact" }), 2);
  assert.equal(await AdminNotification.countDocuments({ type: "trial.enquiry" }), 1);

  // ── 10. Jobs endpoint secret ───────────────────────────────────────────────
  r = await request(app).post("/api/jobs/adminDigest"); assert.equal(r.status, 401);
  r = await request(app).post("/api/jobs/adminDigest").set("x-jobs-secret", "wrong"); assert.equal(r.status, 401);
  r = await request(app).post("/api/jobs/nope").set("x-jobs-secret", "jobs-secret"); assert.equal(r.status, 404);
  r = await request(app).get("/api/jobs").set("x-jobs-secret", "jobs-secret");
  assert.equal(r.status, 200); assert.ok(r.body.data.find((j) => j.name === "renewalReminders").lastRun == null);
  assert.ok(r.body.data.find((j) => j.name === "adminDigest").lastRun.ok);
  const saved = process.env.JOBS_SECRET; delete process.env.JOBS_SECRET;
  r = await request(app).post("/api/jobs/adminDigest").set("x-jobs-secret", "jobs-secret"); assert.equal(r.status, 503);
  process.env.JOBS_SECRET = saved;

  // job.error path: a throwing job raises a critical notification and resolves
  scheduler.JOBS.__boom = { description: "test", cron: () => "0 0 * * *", enabled: () => false, run: async () => { throw new Error("kaboom"); } };
  const jr = await scheduler.runJob("__boom");
  assert.equal(jr.ok, false); assert.equal(jr.error, "kaboom");
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(await AdminNotification.countDocuments({ type: "job.error", severity: "critical" }), 1);
  delete scheduler.JOBS.__boom;

  // account deletion alert carries name/phone after the record is gone
  r = await request(app).delete(`/api/customer/delete-account/${cust2._id}`).set({ Authorization: `Bearer ${signInToken({ _id: cust2._id, name: cust2.name, email: cust2.email })}` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await new Promise((res) => setTimeout(res, 50));
  const del = await AdminNotification.findOne({ type: "account.deleted" }).lean();
  assert.ok(del); assert.match(del.message, /Renewal Parent/); assert.match(del.message, /9000000002/);

  console.log("ALL ADMIN-OPS INTEGRATION CHECKS PASSED");
  console.log(`mails captured: ${mails.length}, sms captured: ${smsSent.length}`);
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
