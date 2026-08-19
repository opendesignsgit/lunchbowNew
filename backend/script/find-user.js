require("dotenv").config();
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const u = await Customer.findOne({ phone: "9790975338" });
  console.log("USER:", u ? { id: String(u._id), name: u.name, email: u.email } : "NOT FOUND");
  if (u) {
    const subs = await Subscription.find({ user: u._id }).lean();
    console.log(`\nSUBSCRIPTIONS (${subs.length}):`);
    subs.forEach((s) =>
      console.log({
        _id: String(s._id), status: s.status, planId: s.planId, price: s.price,
        workingDays: s.workingDays, startDate: s.startDate, endDate: s.endDate,
        orderId: s.orderId, transactionId: s.transactionId,
        children: (s.children || []).map(String),
      })
    );
    const form = await Form.findOne({ user: u._id }).lean();
    console.log("\nFORM:", form ? { step: form.step, paymentStatus: form.paymentStatus, subs: (form.subscriptions||[]).map(String) } : "NONE");
  }
  await mongoose.disconnect();
})();