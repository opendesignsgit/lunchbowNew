/**
 * seed-meal-delete-test.js
 * ------------------------------------------------------------------
 * Creates a full DUMMY account so you can test the meal-deletion mail
 * end to end:  Customer -> Form (with a REAL email) -> Child ->
 * active Subscription -> UserMeal with a few future meals.
 *
 * Then: log in on the store with phone 8438411452 (OTP dev bypass),
 * open the menu calendar, delete one of the seeded meals, and the
 * confirmation + admin alert mails should fire.
 *
 * IMPORTANT: set TEST_EMAIL (or pass --email you@domain.com) to a
 * mailbox you can actually check — the customer confirmation goes there,
 * the admin alert goes to contactus@lunchbowl.co.in.
 *
 * DRY RUN by default. Pass --apply to write.
 * Idempotent: re-running updates the same dummy records (matched by phone).
 *
 * USAGE (from backend/, with .env / .env.local pointing at target DB):
 *   node script/seed-meal-delete-test.js --email you@gmail.com            # dry run
 *   node script/seed-meal-delete-test.js --email you@gmail.com --apply    # write
 * ------------------------------------------------------------------
 */
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Child = require("../models/childModel");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const UserMeal = require("../models/UserMeal");

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const APPLY = process.argv.includes("--apply");
const PHONE = "8438411452";
const TEST_EMAIL = arg("--email", "CHANGE_ME@example.com");
const NUM_MEALS = 5; // future working-day meals to seed

const MEAL_NAMES = [
  "Paneer Butter Masala with Roti",
  "Veg Fried Rice",
  "Curd Rice with Pickle",
  "Aloo Paratha with Curd",
  "Tomato Pasta",
  "Lemon Rice",
  "Chapathi with Dal",
];

// next N working days (Mon-Fri), starting tomorrow
const nextWorkingDays = (n) => {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
  }
  return out;
};

(async () => {
  if (TEST_EMAIL === "CHANGE_ME@example.com") {
    console.error(
      "\n  Set a real inbox first:  --email you@gmail.com\n" +
        "  (the customer confirmation mail is sent to this address)\n"
    );
    process.exit(1);
  }

  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DB_URI ||
    process.env.MONGO_URL;
  if (!uri) {
    console.error("No Mongo connection string found in env (MONGO_URI etc.).");
    process.exit(1);
  }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN"}\n`);

  const dates = nextWorkingDays(NUM_MEALS);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  console.log("Will seed:");
  console.log(`  Phone      : ${PHONE}`);
  console.log(`  Test email : ${TEST_EMAIL}`);
  console.log(`  Meals      : ${NUM_MEALS} (${dates.map(d => d.toLocaleDateString("en-GB")).join(", ")})`);
  console.log("");

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to create.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  // 1. Customer (matched by phone)
  let customer = await Customer.findOne({ phone: PHONE });
  if (!customer) {
    customer = await Customer.create({
      name: "Meal Delete Tester",
      email: TEST_EMAIL,
      phone: PHONE,
    });
    console.log(`+ Customer created ${customer._id}`);
  } else {
    customer.email = TEST_EMAIL;
    await customer.save();
    console.log(`~ Customer reused ${customer._id} (email updated)`);
  }
  const userId = customer._id;

  // 2. Form (with a REAL parentDetails.email — this is what mail uses)
  let form = await Form.findOne({ user: userId });
  const parentDetails = {
    fatherFirstName: "Test",
    fatherLastName: "Parent",
    motherFirstName: "Test",
    motherLastName: "Mother",
    mobile: PHONE,
    email: TEST_EMAIL,
    address: "1 Test Street",
    pincode: "600001",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
  };
  if (!form) {
    form = await Form.create({
      user: userId,
      step: 4,
      parentDetails,
      subscriptions: [],
      paymentStatus: "Success",
      subscriptionCount: 0,
      wallet: { points: 0, history: [] },
    });
    console.log(`+ Form created ${form._id}`);
  } else {
    form.parentDetails = { ...form.parentDetails, ...parentDetails };
    await form.save({ validateModifiedOnly: true });
    console.log(`~ Form reused ${form._id} (parent email ensured)`);
  }

  // 3. Child
  let child = await Child.findOne({ user: userId });
  if (!child) {
    child = await Child.create({
      user: userId,
      childFirstName: "Test",
      childLastName: "Kid",
      dob: new Date("2016-01-01"),
      lunchTime: "12:30 PM",
      school: "Test School",
      location: "Chennai",
      childClass: "3",
      section: "A",
    });
    console.log(`+ Child created ${child._id}`);
  } else {
    console.log(`~ Child reused ${child._id}`);
  }

  // 4. Subscription (active). The store uses subscription._id as the planId.
  let sub = await Subscription.findOne({ user: userId, orderId: "TEST-MEALDELETE" });
  if (!sub) {
    sub = await Subscription.create({
      user: userId,
      planId: "1",
      startDate,
      endDate,
      workingDays: NUM_MEALS,
      price: NUM_MEALS * 225,
      orderId: "TEST-MEALDELETE",
      paymentAmount: NUM_MEALS * 225,
      paymentDate: new Date(),
      paymentMethod: "TEST",
      transactionId: "TEST-MEALDELETE",
      status: "active",
      children: [child._id],
    });
    console.log(`+ Subscription created ${sub._id}`);
  } else {
    sub.startDate = startDate;
    sub.endDate = endDate;
    sub.status = "active";
    sub.children = [child._id];
    await sub.save();
    console.log(`~ Subscription reused ${sub._id}`);
  }

  // link sub to form
  if (!form.subscriptions.map(String).includes(String(sub._id))) {
    form.subscriptions.push(sub._id);
    form.subscriptionCount = form.subscriptions.length;
    await form.save({ validateModifiedOnly: true });
  }

  // 5. UserMeal — plan.planId MUST equal subscription._id (store convention)
  const planId = String(sub._id);
  const meals = dates.map((d, i) => ({
    mealDate: d,
    mealName: MEAL_NAMES[i % MEAL_NAMES.length],
    deleted: false,
  }));

  let userMeal = await UserMeal.findOne({ userId });
  if (!userMeal) {
    userMeal = new UserMeal({ userId, plans: [] });
  }
  let plan = userMeal.plans.find((p) => p.planId === planId);
  if (!plan) {
    userMeal.plans.push({
      planId,
      children: [{ childId: child._id, meals }],
    });
  } else {
    let childEntry = plan.children.find((c) => c.childId.equals(child._id));
    if (!childEntry) {
      plan.children.push({ childId: child._id, meals });
    } else {
      childEntry.meals = meals; // reset for a clean test
    }
  }
  await userMeal.save();
  console.log(`~ UserMeal saved (${meals.length} meals under plan ${planId})`);

  console.log("\nDONE. To test:");
  console.log(`  1. Store login with phone ${PHONE} (OTP dev bypass).`);
  console.log("  2. Open the menu calendar — you'll see the seeded meals.");
  console.log("  3. Delete one. Customer mail -> " + TEST_EMAIL);
  console.log("     Admin mail -> contactus@lunchbowl.co.in");
  console.log("  4. Watch logs: pm2 logs <name> | grep -i 'meal delete'\n");

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
