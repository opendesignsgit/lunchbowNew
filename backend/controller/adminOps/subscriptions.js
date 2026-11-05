const Subscription = require("../../models/subscriptionModel");
const Child = require("../../models/childModel");
const Form = require("../../models/Form");
const Customer = require("../../models/Customer");
const { recordAudit } = require("../../lib/audit");
const { notifyAdmin } = require("../../lib/notify");
const { toDateKey } = require("../../lib/pricing");
const { isValidId, dateKeyToDate, subscriptionView, fail } = require("./helpers");

const EDITABLE_STATUSES = ["active", "upcoming", "deactivated"];

/** Children ids must be valid and belong to the user. Returns the list or an error string. */
const checkChildren = async (children, userId) => {
  if (!Array.isArray(children) || children.length === 0) return { error: "children must be a non-empty array" };
  const ids = Array.from(new Set(children.map(String)));
  if (ids.some((id) => !isValidId(id))) return { error: "children contains an invalid id" };
  const found = await Child.countDocuments({ _id: { $in: ids }, user: userId });
  if (found !== ids.length) return { error: "every child must belong to this customer" };
  return { ids };
};

/** PUT /subscriptions/:id */
const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return fail(res, 400, "Invalid subscription id");
    const { startDate, endDate, status, workingDays, children, reason } = req.body || {};
    if (!reason || !String(reason).trim()) return fail(res, 400, "reason is required");

    const sub = await Subscription.findById(id);
    if (!sub) return fail(res, 404, "Subscription not found");
    const before = subscriptionView(sub);

    if (startDate !== undefined) {
      const d = dateKeyToDate(startDate);
      if (!d) return fail(res, 400, "startDate must be YYYY-MM-DD");
      sub.startDate = d;
    }
    if (endDate !== undefined) {
      const d = dateKeyToDate(endDate);
      if (!d) return fail(res, 400, "endDate must be YYYY-MM-DD");
      sub.endDate = d;
    }
    if (toDateKey(sub.endDate) < toDateKey(sub.startDate)) return fail(res, 400, "endDate must be on or after startDate");
    if (status !== undefined) {
      if (!EDITABLE_STATUSES.includes(status)) return fail(res, 400, `status must be one of ${EDITABLE_STATUSES.join(", ")}`);
      sub.status = status;
    }
    if (workingDays !== undefined) {
      const n = Number(workingDays);
      if (!Number.isInteger(n) || n < 1) return fail(res, 400, "workingDays must be a positive whole number");
      sub.workingDays = n;
    }
    if (children !== undefined) {
      const check = await checkChildren(children, sub.user);
      if (check.error) return fail(res, 400, check.error);
      sub.children = check.ids;
    }

    await sub.save();
    const after = subscriptionView(sub);

    await recordAudit(req, { action: "subscription.update", targetType: "Subscription", targetId: sub._id, before, after, reason });
    notifyAdmin({
      type: "admin.override",
      title: "Subscription edited",
      message: `Subscription ${sub._id} (${after.startDateKey} → ${after.endDateKey}, ${sub.status}) edited: ${reason}`,
      userId: sub.user,
      meta: { subscriptionId: String(sub._id), adminId: req.user && req.user._id, reason, changed: Object.keys(req.body).filter((k) => k !== "reason") },
    });

    return res.json({ success: true, data: after });
  } catch (err) {
    console.error("adminOps.updateSubscription:", err);
    return fail(res, 500, err.message);
  }
};

/** POST /subscriptions — manual plan for a user (orphan repair). */
const createSubscription = async (req, res) => {
  try {
    const { userId, planId, startDate, endDate, workingDays, price, children, status, note, orderId, paymentAmount, paymentMethod } = req.body || {};
    if (!isValidId(userId)) return fail(res, 400, "Valid userId is required");
    const user = await Customer.findById(userId).select("_id name").lean();
    if (!user) return fail(res, 404, "Customer not found");
    if (!planId) return fail(res, 400, "planId is required");
    const start = dateKeyToDate(startDate);
    const end = dateKeyToDate(endDate);
    if (!start || !end) return fail(res, 400, "startDate and endDate must be YYYY-MM-DD");
    if (toDateKey(end) < toDateKey(start)) return fail(res, 400, "endDate must be on or after startDate");
    const days = Number(workingDays);
    if (!Number.isInteger(days) || days < 1) return fail(res, 400, "workingDays must be a positive whole number");
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) return fail(res, 400, "price must be a number");
    const finalStatus = status || "active";
    if (!EDITABLE_STATUSES.includes(finalStatus)) return fail(res, 400, `status must be one of ${EDITABLE_STATUSES.join(", ")}`);
    const check = await checkChildren(children, userId);
    if (check.error) return fail(res, 400, check.error);

    const sub = await Subscription.create({
      user: userId,
      planId: String(planId),
      startDate: start,
      endDate: end,
      workingDays: days,
      price: amount,
      status: finalStatus,
      children: check.ids,
      orderId: orderId || `ADMIN-${Date.now()}`,
      paymentAmount: paymentAmount != null ? Number(paymentAmount) : amount,
      paymentMethod: paymentMethod || "Manual",
      paymentDate: new Date(),
    });

    // Link it to the form the way the settlement does, so the website/app list it.
    const formUpdate = { $addToSet: { subscriptions: sub._id } };
    if (finalStatus !== "deactivated") {
      formUpdate.$set = { paymentStatus: "Success" };
      formUpdate.$max = { step: 4 };
      formUpdate.$inc = { subscriptionCount: 1 };
    }
    await Form.updateOne({ user: userId }, formUpdate);

    const view = subscriptionView(sub);
    await recordAudit(req, { action: "subscription.create", targetType: "Subscription", targetId: sub._id, after: view, reason: note || "" });
    notifyAdmin({
      type: "admin.override",
      title: "Subscription created manually",
      message: `${user.name || "Customer"}: ${days} days (${view.startDateKey} → ${view.endDateKey}) ₹${amount}, ${finalStatus}. ${note || ""}`.trim(),
      userId,
      meta: { subscriptionId: String(sub._id), adminId: req.user && req.user._id, note: note || "" },
    });
    return res.status(201).json({ success: true, data: view });
  } catch (err) {
    console.error("adminOps.createSubscription:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { updateSubscription, createSubscription };
