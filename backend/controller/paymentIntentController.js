/**
 * POST /api/ccavenue/initiate
 *
 * Prices and encrypts a CCAvenue payment on the server, so clients never hold the
 * working key or decide the amount. Used by the mobile app; the website can move
 * to it as well.
 *
 * Body: { type, ...typeSpecificFields }
 *  - subscription: {}                           → first plan (registration step 4)
 *  - renewal:      {}                           → latest pending_payment renewal
 *  - addChild:     { subscriptionId, children } → children = full child objects
 *  - holiday:      { subscriptionId, date, children: [{ childId, mealName }] }
 *
 * Responds { success, data: { gatewayUrl, encRequest, accessCode, orderId, amount, resultUrl } }.
 * The client POSTs encRequest + access_code to gatewayUrl. When the payment finishes,
 * the response handler redirects to resultUrl?status=success|failed&type=…&orderId=….
 */
const mongoose = require("mongoose");
const Form = require("../models/Form");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Holiday = require("../models/holidaySchema");
const HolidayPayment = require("../models/HolidayPayment");
const PaymentIntent = require("../models/PaymentIntent");
const {
  getPricingConfig,
  computePlanPrice,
  maxWalletRedeem,
  toDateKey,
  todayKeyIST,
  addDaysKey,
  dayOfWeekKey,
  countWorkingDays,
  nextWorkingDayKey,
  holidayKeySet,
} = require("../lib/pricing");
const {
  getCcavConfig,
  getApiPublicUrl,
  isTestAmountMode,
  buildEncryptedRequest,
  billingFields,
} = require("../lib/ccavenue");

// Prices may differ by rounding between clients; anything beyond this is rejected.
const PRICE_TOLERANCE = 2;

class PaymentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const randomSuffix = () => Math.floor(Math.random() * 1000);

const createdAtOf = (s) =>
  s.createdAt ? new Date(s.createdAt).getTime() : s._id.getTimestamp().getTime();

const REQUIRED_CHILD_FIELDS = [
  "childFirstName",
  "childLastName",
  "dob",
  "lunchTime",
  "school",
  "location",
  "childClass",
  "section",
];

async function priceSubscription(form) {
  if (form.paymentStatus === "Success") {
    throw new PaymentError(409, "Your subscription is already paid.");
  }
  const sub = [...(form.subscriptions || [])]
    .filter((s) => ["active", "pending_payment"].includes(s.status))
    .sort((a, b) => createdAtOf(b) - createdAtOf(a))[0];
  if (!sub) throw new PaymentError(404, "No subscription plan found. Please choose a plan first.");

  const expected = computePlanPrice(sub.workingDays, (sub.children || []).length);
  if (Math.abs(Number(sub.price) - expected) > PRICE_TOLERANCE) {
    throw new PaymentError(409, "Your plan price is out of date. Please choose your plan again.");
  }
  return {
    orderId: `LB${Date.now()}${randomSuffix()}`,
    amount: Number(sub.price),
    path: "/api/ccavenue/response",
    params: { merchant_param2: sub.planId },
    meta: { subscriptionId: String(sub._id) },
  };
}

async function priceRenewal(form) {
  // Same rule as the website's Renew button: no second renewal while one is waiting to start.
  if ((form.subscriptions || []).some((s) => s.status === "upcoming")) {
    throw new PaymentError(409, "You already have an upcoming plan.");
  }
  const sub = [...(form.subscriptions || [])]
    .filter((s) => s.status === "pending_payment")
    .sort((a, b) => createdAtOf(b) - createdAtOf(a))[0];
  if (!sub) throw new PaymentError(404, "No renewal plan found. Please choose a plan first.");

  const gross = computePlanPrice(sub.workingDays, (sub.children || []).length);
  const walletUsed = Number(sub.walletUsed || 0);
  const walletPoints = (form.wallet && form.wallet.points) || 0;
  if (walletUsed > maxWalletRedeem(gross, walletPoints) + 0.01) {
    throw new PaymentError(409, "Wallet points have changed. Please choose your plan again.");
  }
  if (Math.abs(Number(sub.price) - (gross - walletUsed)) > PRICE_TOLERANCE) {
    throw new PaymentError(409, "Your plan price is out of date. Please choose your plan again.");
  }
  return {
    orderId: `RENEW${Date.now()}${randomSuffix()}`,
    amount: Number(sub.price),
    path: "/api/ccavenue/response",
    params: {
      merchant_param2: sub.planId,
      merchant_param4: walletUsed,
      merchant_param5: Math.max(0, walletPoints - walletUsed),
    },
    meta: { subscriptionId: String(sub._id), walletUsed },
  };
}

async function priceAddChild(form, userId, body) {
  const { subscriptionId, children } = body;
  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
    throw new PaymentError(400, "Invalid subscription.");
  }
  if (!Array.isArray(children) || children.length === 0) {
    throw new PaymentError(400, "Select at least one child to add.");
  }
  const sub = await Subscription.findOne({ _id: subscriptionId, user: userId });
  if (!sub || !["active", "upcoming"].includes(sub.status)) {
    throw new PaymentError(404, "No active or upcoming plan found.");
  }

  const existing = new Set((sub.children || []).map(String));
  const newChildren = children.filter((c) => !(c._id && existing.has(String(c._id))));
  if (newChildren.length === 0) throw new PaymentError(400, "These children are already on the plan.");

  const cfg = getPricingConfig();
  if (existing.size + newChildren.length > cfg.maxChildren) {
    throw new PaymentError(400, `A plan can have at most ${cfg.maxChildren} children.`);
  }
  for (const child of newChildren) {
    const missing = REQUIRED_CHILD_FIELDS.filter((f) => !child[f]);
    if (missing.length) throw new PaymentError(400, `Child details are incomplete: ${missing.join(", ")}`);
  }

  const today = todayKeyIST();
  const startKey = toDateKey(sub.startDate);
  const endKey = toDateKey(sub.endDate);
  let amount;
  if (startKey > today) {
    // Upcoming plan: each child costs the same share of the plan as the existing ones
    // (same rule as the website's add-upcoming-child page).
    const perChild = Math.round(Number(sub.price) / Math.max(existing.size, 1));
    amount = perChild * newChildren.length;
  } else {
    // Active plan: remaining working days from the next working day, at the daily rate
    // (same rule as the website's add-child page).
    const holidays = holidayKeySet(await Holiday.find({}).select("date").lean());
    const fromKey = nextWorkingDayKey(addDaysKey(today, 1), holidays);
    const days = fromKey > endKey ? 0 : countWorkingDays(fromKey, endKey, holidays);
    if (days === 0) throw new PaymentError(400, "Your plan has no remaining working days.");
    amount = newChildren.length * days * cfg.pricePerDayPerChild;
  }

  return {
    orderId: `LB${Date.now()}${randomSuffix()}`,
    amount,
    path: "/api/ccavenue/response/addChildPayment",
    params: { merchant_param2: String(sub._id), merchant_param3: "intent" },
    meta: { subscriptionId: String(sub._id), children: newChildren },
  };
}

async function priceHoliday(userId, body) {
  const { subscriptionId, date, children } = body;
  const dateKey = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (!dateKey) throw new PaymentError(400, "Invalid date.");
  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) throw new PaymentError(400, "Invalid subscription.");
  if (!Array.isArray(children) || children.length === 0) {
    throw new PaymentError(400, "Choose a meal for at least one child.");
  }

  const sub = await Subscription.findOne({ _id: subscriptionId, user: userId });
  if (!sub) throw new PaymentError(404, "Plan not found.");
  if (dateKey <= todayKeyIST()) throw new PaymentError(400, "Meals can only be booked for future dates.");
  if (dateKey < toDateKey(sub.startDate) || dateKey > toDateKey(sub.endDate)) {
    throw new PaymentError(400, "This date is outside your plan.");
  }

  const holidays = holidayKeySet(await Holiday.find({}).select("date").lean());
  const dow = dayOfWeekKey(dateKey);
  if (dow === 0) throw new PaymentError(400, "LunchBowl is closed on Sundays.");
  if (dow !== 6 && !holidays.has(dateKey)) {
    throw new PaymentError(400, "This is a regular working day; no extra payment is needed.");
  }

  const planChildren = new Set((sub.children || []).map(String));
  const alreadyPaid = new Set(
    (await HolidayPayment.find({ userId, mealDate: dateKey, paymentStatus: "Paid" }).select("childId").lean())
      .map((p) => String(p.childId))
  );
  const childrenData = [];
  for (const c of children) {
    if (!c || !planChildren.has(String(c.childId))) throw new PaymentError(400, "Child is not on this plan.");
    if (!c.mealName) throw new PaymentError(400, "Choose a meal for each child.");
    if (alreadyPaid.has(String(c.childId))) continue;
    childrenData.push({
      childId: String(c.childId),
      dish: { mealName: String(c.mealName) },
      mealDate: dateKey,
      planId: String(sub._id),
    });
  }
  if (childrenData.length === 0) throw new PaymentError(409, "This meal is already paid for.");

  return {
    orderId: `LB-HOLIDAY-${Date.now()}${randomSuffix()}`,
    amount: childrenData.length * getPricingConfig().holidayMealPricePerChild,
    path: "/api/ccavenue/response/holiydayPayment",
    params: { merchant_param2: dateKey, merchant_param3: "intent" },
    meta: { subscriptionId: String(sub._id), mealDate: dateKey, childrenData },
  };
}

exports.initiatePayment = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Please log in again." });
    }
    const { type } = req.body || {};

    const [customer, form] = await Promise.all([
      Customer.findById(userId).lean(),
      Form.findOne({ user: userId }).populate("subscriptions"),
    ]);
    if (!customer || !form) {
      return res.status(404).json({ success: false, message: "Account details not found." });
    }

    let priced;
    if (type === "subscription") priced = await priceSubscription(form);
    else if (type === "renewal") priced = await priceRenewal(form);
    else if (type === "addChild") priced = await priceAddChild(form, userId, req.body);
    else if (type === "holiday") priced = await priceHoliday(userId, req.body);
    else return res.status(400).json({ success: false, message: "Unknown payment type." });

    const amount = isTestAmountMode() ? 1 : Math.round(priced.amount * 100) / 100;
    if (!(amount > 0)) {
      return res.status(400).json({ success: false, message: "Nothing to pay." });
    }

    const base = getApiPublicUrl(req);
    const cfg = getCcavConfig();
    const encRequest = buildEncryptedRequest({
      merchant_id: cfg.merchantId,
      order_id: priced.orderId,
      amount: amount.toFixed(2),
      currency: "INR",
      redirect_url: `${base}${priced.path}`,
      cancel_url: `${base}${priced.path}`,
      language: "EN",
      ...billingFields(customer, form.parentDetails),
      merchant_param1: String(userId),
      merchant_param3: priced.orderId,
      ...priced.params,
    });

    await PaymentIntent.create({
      orderId: priced.orderId,
      user: userId,
      type,
      amount,
      source: "app",
      meta: priced.meta,
    });

    return res.json({
      success: true,
      data: {
        gatewayUrl: cfg.gatewayUrl,
        encRequest,
        accessCode: cfg.accessCode,
        orderId: priced.orderId,
        amount,
        resultUrl: `${base}/api/ccavenue/app-result`,
      },
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error("initiatePayment error:", err);
    return res.status(500).json({ success: false, message: "Could not start the payment. Please try again." });
  }
};

/**
 * GET /api/ccavenue/app-result
 * Landing page for app payments. The app's WebView intercepts this URL and closes
 * itself; the page is only seen if interception fails.
 */
exports.appPaymentResult = (req, res) => {
  const ok = req.query.status === "success";
  res
    .status(200)
    .type("html")
    .send(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>LunchBowl payment</title></head><body style="font-family:sans-serif;text-align:center;padding:48px 16px">` +
        `<h2>${ok ? "Payment successful" : "Payment not completed"}</h2>` +
        `<p>You can return to the LunchBowl app.</p></body></html>`
    );
};

exports.PRICE_TOLERANCE = PRICE_TOLERANCE;
