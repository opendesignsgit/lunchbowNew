const Customer = require("../../models/Customer");
const Form = require("../../models/Form");
const Child = require("../../models/childModel");
const Subscription = require("../../models/subscriptionModel");
const UserMeal = require("../../models/UserMeal");
const UserPayment = require("../../models/Payment"); // read-only here (lead owns the settlement code)
const PaymentIntent = require("../../models/PaymentIntent"); // read-only
const HolidayPayment = require("../../models/HolidayPayment");
const SmsLog = require("../../models/SmsLog");
const AdminNotification = require("../../models/AdminNotification");
const { toDateKey, todayKeyIST, addDaysKey } = require("../../lib/pricing");
const { isValidId, parsePage, escapeRegex, subscriptionView, fail } = require("./helpers");

/** GET /customers?q=&page=&limit= */
const searchCustomers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const q = (req.query.q || "").trim();

    let customers;
    let total;
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      const [byCustomer, byForm] = await Promise.all([
        Customer.find({ $or: [{ name: re }, { phone: re }, { email: re }] }).select("_id").lean(),
        Form.find({
          $or: [
            { "parentDetails.fatherFirstName": re },
            { "parentDetails.fatherLastName": re },
            { "parentDetails.motherFirstName": re },
            { "parentDetails.motherLastName": re },
            { "parentDetails.mobile": re },
            { "parentDetails.email": re },
          ],
        })
          .select("user")
          .lean(),
      ]);
      const ids = Array.from(new Set([...byCustomer.map((c) => String(c._id)), ...byForm.map((f) => String(f.user))]));
      total = ids.length;
      customers = await Customer.find({ _id: { $in: ids } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-password")
        .lean();
    } else {
      [customers, total] = await Promise.all([
        Customer.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-password").lean(),
        Customer.countDocuments({}),
      ]);
    }

    const userIds = customers.map((c) => c._id);
    const [forms, subs, childCounts] = await Promise.all([
      Form.find({ user: { $in: userIds } }).select("user step paymentStatus wallet.points subscriptionCount parentDetails.mobile parentDetails.email").lean(),
      Subscription.find({ user: { $in: userIds }, status: { $in: ["active", "upcoming", "pending_payment"] } })
        .select("user planId startDate endDate status workingDays price children")
        .lean(),
      Child.aggregate([{ $match: { user: { $in: userIds } } }, { $group: { _id: "$user", count: { $sum: 1 } } }]),
    ]);
    const formBy = new Map(forms.map((f) => [String(f.user), f]));
    const childBy = new Map(childCounts.map((c) => [String(c._id), c.count]));
    const subsBy = new Map();
    for (const s of subs) {
      const k = String(s.user);
      if (!subsBy.has(k)) subsBy.set(k, []);
      subsBy.get(k).push(subscriptionView(s));
    }

    const data = customers.map((c) => {
      const f = formBy.get(String(c._id));
      const list = subsBy.get(String(c._id)) || [];
      return {
        _id: c._id,
        name: c.name,
        phone: c.phone || (f && f.parentDetails && f.parentDetails.mobile) || "",
        email: c.email || (f && f.parentDetails && f.parentDetails.email) || "",
        freeTrial: Boolean(c.freeTrial),
        createdAt: c.createdAt,
        step: f ? f.step : null,
        paymentStatus: f ? f.paymentStatus : null,
        subscriptionCount: f ? f.subscriptionCount : 0,
        walletPoints: f && f.wallet ? f.wallet.points || 0 : 0,
        childrenCount: childBy.get(String(c._id)) || 0,
        activePlan: list.find((s) => s.status === "active") || null,
        upcomingPlan: list.find((s) => s.status === "upcoming") || null,
        pendingPlan: list.find((s) => s.status === "pending_payment") || null,
      };
    });

    return res.json({ success: true, data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("adminOps.searchCustomers:", err);
    return fail(res, 500, err.message);
  }
};

/** Booked / deleted counts and the next 7 days of meals for one subscription. */
const mealsSummaryFor = (userMeal, sub, todayKey) => {
  const plan = userMeal && userMeal.plans.find((p) => p.planId === String(sub._id));
  const weekEnd = addDaysKey(todayKey, 7);
  const summary = { booked: 0, deleted: 0, next7Days: [] };
  if (!plan) return summary;
  for (const entry of plan.children) {
    for (const meal of entry.meals) {
      const key = toDateKey(meal.mealDate);
      if (meal.deleted) summary.deleted++;
      else summary.booked++;
      if (key && key >= todayKey && key < weekEnd) {
        summary.next7Days.push({ date: key, childId: entry.childId, mealName: meal.mealName, deleted: Boolean(meal.deleted) });
      }
    }
  }
  summary.next7Days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return summary;
};

/** GET /customers/:userId/overview */
const customerOverview = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return fail(res, 400, "Invalid userId");

    const user = await Customer.findById(userId).select("-password").lean();
    if (!user) return fail(res, 404, "Customer not found");

    const todayKey = todayKeyIST();
    const [form, children, subscriptions, userPayment, intents, userMeal, holidayPayments, smsCount, notifications] =
      await Promise.all([
        Form.findOne({ user: userId }).lean(),
        Child.find({ user: userId }).lean(),
        Subscription.find({ user: userId }).sort({ startDate: -1 }).populate("children").lean(),
        UserPayment.findOne({ user: userId }).lean(),
        PaymentIntent.find({ user: userId }).sort({ createdAt: -1 }).limit(50).lean(),
        UserMeal.findOne({ userId }).lean(),
        HolidayPayment.find({ userId }).sort({ createdAt: -1 }).lean(),
        SmsLog.countDocuments({ customerId: userId }),
        AdminNotification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
      ]);

    const payments = ((userPayment && userPayment.payments) || [])
      .slice()
      .sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));

    const subs = subscriptions.map((s) => ({
      ...subscriptionView(s),
      meals: mealsSummaryFor(userMeal, s, todayKey),
    }));

    const wallet = form && form.wallet ? form.wallet : { points: 0, history: [] };
    const walletHistory = (wallet.history || []).slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.json({
      success: true,
      data: {
        user,
        form: form
          ? {
              _id: form._id,
              step: form.step,
              paymentStatus: form.paymentStatus,
              subscriptionCount: form.subscriptionCount,
              parentDetails: form.parentDetails,
              wallet: { points: wallet.points || 0, history: walletHistory.slice(0, 50), historyCount: walletHistory.length },
            }
          : null,
        children,
        subscriptions: subs,
        payments,
        paymentTotals: userPayment ? { count: userPayment.total_payments, amount: userPayment.total_amount } : { count: 0, amount: 0 },
        paymentIntents: intents,
        holidayPayments,
        smsLogCount: smsCount,
        notifications,
        today: todayKey,
      },
    });
  } catch (err) {
    console.error("adminOps.customerOverview:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { searchCustomers, customerOverview, mealsSummaryFor };
