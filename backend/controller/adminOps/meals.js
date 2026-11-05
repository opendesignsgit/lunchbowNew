const UserMeal = require("../../models/UserMeal");
const Subscription = require("../../models/subscriptionModel");
const Child = require("../../models/childModel");
const Form = require("../../models/Form");
const { toDateKey, getPricingConfig } = require("../../lib/pricing");
const { recordAudit } = require("../../lib/audit");
const { notifyAdmin } = require("../../lib/notify");
const { isValidId, DATE_KEY_RE, parentName, childName, fail } = require("./helpers");

const ACTIONS = ["set", "delete", "restore"];

/**
 * POST /meals/override
 * { userId, subscriptionId, childId, date: "YYYY-MM-DD", action: set|delete|restore,
 *   mealName?, creditWallet?, reason }
 *
 * Same UserMeal layout and India-calendar-day matching as saveMealPlans/deleteMeal in
 * customerController, minus the customer-only "after today" rule.
 */
const overrideMeal = async (req, res) => {
  try {
    const { userId, subscriptionId, childId, date, action, mealName, creditWallet, reason } = req.body || {};
    if (!isValidId(userId) || !isValidId(subscriptionId) || !isValidId(childId))
      return fail(res, 400, "userId, subscriptionId and childId must be valid ids");
    if (typeof date !== "string" || !DATE_KEY_RE.test(date)) return fail(res, 400, "date must be YYYY-MM-DD");
    if (!ACTIONS.includes(action)) return fail(res, 400, `action must be one of ${ACTIONS.join(", ")}`);
    if (!reason || !String(reason).trim()) return fail(res, 400, "reason is required");
    if (action === "set" && (!mealName || !String(mealName).trim())) return fail(res, 400, "mealName is required for set");

    const [sub, child] = await Promise.all([
      Subscription.findOne({ _id: subscriptionId, user: userId }).lean(),
      Child.findOne({ _id: childId, user: userId }).lean(),
    ]);
    if (!sub) return fail(res, 404, "Subscription not found for this customer");
    if (!child) return fail(res, 404, "Child not found for this customer");

    let userMeal = await UserMeal.findOne({ userId });
    if (!userMeal) {
      if (action !== "set") return fail(res, 404, "No meals saved for this customer");
      userMeal = new UserMeal({ userId, plans: [] });
    }
    let plan = userMeal.plans.find((p) => p.planId === String(subscriptionId));
    if (!plan) {
      if (action !== "set") return fail(res, 404, "No meals saved for this subscription");
      userMeal.plans.push({ planId: String(subscriptionId), children: [] });
      plan = userMeal.plans[userMeal.plans.length - 1];
    }
    let entry = plan.children.find((c) => String(c.childId) === String(childId));
    if (!entry) {
      if (action !== "set") return fail(res, 404, "No meals saved for this child");
      plan.children.push({ childId, meals: [] });
      entry = plan.children[plan.children.length - 1];
    }
    const meal = entry.meals.find((m) => toDateKey(m.mealDate) === date);
    const before = meal ? { mealName: meal.mealName, deleted: Boolean(meal.deleted) } : null;

    let walletChange = 0;
    if (action === "set") {
      if (meal) {
        meal.mealName = String(mealName).trim();
        meal.deleted = false;
      } else {
        entry.meals.push({ mealDate: new Date(`${date}T00:00:00Z`), mealName: String(mealName).trim(), deleted: false });
      }
    } else if (action === "delete") {
      if (!meal) return fail(res, 404, "No meal booked on that date");
      if (meal.deleted) return fail(res, 409, "Meal is already deleted");
      meal.deleted = true;
      if (creditWallet) walletChange = getPricingConfig().pricePerDayPerChild;
    } else {
      if (!meal) return fail(res, 404, "No meal booked on that date");
      if (!meal.deleted) return fail(res, 409, "Meal is not deleted");
      meal.deleted = false;
      if (creditWallet) walletChange = -getPricingConfig().pricePerDayPerChild;
    }
    userMeal.markModified("plans");
    await userMeal.save();

    const updated = entry.meals.find((m) => toDateKey(m.mealDate) === date);
    const after = { mealName: updated.mealName, deleted: Boolean(updated.deleted) };

    const form = await Form.findOne({ user: userId });
    let wallet = null;
    if (walletChange !== 0 && form) {
      if (!form.wallet) form.wallet = { points: 0, history: [] };
      const points = Math.max(0, (form.wallet.points || 0) + walletChange);
      const applied = points - (form.wallet.points || 0);
      form.wallet.points = points;
      form.wallet.history.push({
        date: new Date(),
        change: applied,
        reason: action === "delete" ? "Meal deleted (admin)" : "Meal restored (admin)",
        childName: childName(child),
        mealName: after.mealName,
      });
      await form.save();
      wallet = { points, change: applied };
    }

    await recordAudit(req, {
      action: `meal.${action}`,
      targetType: "UserMeal",
      targetId: userMeal._id,
      before: { date, childId, subscriptionId, meal: before },
      after: { date, childId, subscriptionId, meal: after, wallet },
      reason,
    });
    notifyAdmin({
      type: "admin.override",
      title: `Meal ${action} by admin`,
      message: `${parentName(form) || "Customer"} / ${childName(child)}: ${date} ${after.mealName} (${action})${
        wallet ? `, wallet ${wallet.change > 0 ? "+" : ""}${wallet.change}` : ""
      }. ${reason}`,
      userId,
      meta: { adminId: req.user && req.user._id, subscriptionId, childId, date, action, reason },
    });

    return res.json({ success: true, data: { date, childId, subscriptionId, meal: after, wallet } });
  } catch (err) {
    console.error("adminOps.overrideMeal:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { overrideMeal };
