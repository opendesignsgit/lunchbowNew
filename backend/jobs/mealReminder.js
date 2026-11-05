/**
 * Meal-adding reminder (skeleton).
 *
 * runMealReminders(): parents whose paid active plan has NO meal booked for the next
 * working day get an email asking them to pick one. SMS/push are placeholders until a
 * DLT template exists. Off by default: MEAL_REMINDER_ENABLED=true turns the cron on
 * (MEAL_REMINDER_CRON, default 18:00 IST).
 */
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const UserMeal = require("../models/UserMeal");
const Holiday = require("../models/holidaySchema");
const ReminderLog = require("../models/ReminderLog");
const { toDateKey, todayKeyIST, addDaysKey, nextWorkingDayKey, holidayKeySet } = require("../lib/pricing");
const { sendMail, escapeHtml } = require("../lib/notify/email");
const { notifyAdmin } = require("../lib/notify");

const MENU_URL = "https://lunchbowl.co.in/user/menuCalendarPage";

const mealReminderEmail = ({ parentName, dateKey, missing }) => ({
  subject: "Pick tomorrow's Lunch Bowl meal",
  html: `
    <p>Hi ${escapeHtml(parentName || "Parent")},</p>
    <p>No meal has been chosen yet for <strong>${escapeHtml(dateKey)}</strong> for ${escapeHtml(missing.join(", "))}.</p>
    <p>👉 <a href="${MENU_URL}">Choose a meal now</a> so the lunchbox goes out on time.</p>
    <p>– Team Lunch Bowl</p>
  `,
});

/** Children in `sub` with no non-deleted meal on `dateKey`. */
const missingChildrenFor = (userMeal, sub, dateKey) => {
  const plan = userMeal && userMeal.plans.find((p) => p.planId === String(sub._id));
  return (sub.children || []).filter((child) => {
    const entry = plan && plan.children.find((c) => String(c.childId) === String(child._id));
    return !(entry && entry.meals.some((m) => !m.deleted && toDateKey(m.mealDate) === dateKey));
  });
};

const runMealReminders = async ({ dateKey } = {}) => {
  const holidays = holidayKeySet(await Holiday.find({}).select("date").lean());
  const target = dateKey || nextWorkingDayKey(addDaysKey(todayKeyIST(), 1), holidays);
  const summary = { dateKey: target, checked: 0, emails: 0, skipped: 0, errors: 0, sms: 0, push: 0 };

  const subs = await Subscription.find({
    status: "active",
    startDate: { $lte: new Date(`${target}T23:59:59Z`) },
    endDate: { $gte: new Date(`${addDaysKey(target, -1)}T00:00:00Z`) },
  })
    .populate("children")
    .lean();

  for (const sub of subs) {
    if (toDateKey(sub.startDate) > target || toDateKey(sub.endDate) < target) continue;
    summary.checked++;
    try {
      const [userMeal, form] = await Promise.all([UserMeal.findOne({ userId: sub.user }).lean(), Form.findOne({ user: sub.user }).lean()]);
      const missing = missingChildrenFor(userMeal, sub, target);
      if (missing.length === 0) continue;
      const email = form && form.parentDetails && form.parentDetails.email;
      if (!email) {
        summary.skipped++;
        continue;
      }
      if (await ReminderLog.exists({ userId: sub.user, kind: "meal", dateKey: target, channel: "email" })) {
        summary.skipped++;
        continue;
      }
      const parentName = form.parentDetails.fatherFirstName || "";
      const names = missing.map((c) => `${c.childFirstName} ${c.childLastName || ""}`.trim());
      const ok = await sendMail({ to: email, ...mealReminderEmail({ parentName, dateKey: target, missing: names }) });
      if (ok) {
        await ReminderLog.create({ subscriptionId: sub._id, userId: sub.user, kind: "meal", dateKey: target, channel: "email" });
        summary.emails++;
        // TODO: SMS once a DLT template exists; push once the customer app registers devices.
        notifyAdmin({
          type: "reminder.meal.sent",
          title: "Meal reminder sent",
          message: `${parentName || "Parent"} (${email}): no meal for ${names.join(", ")} on ${target}`,
          userId: sub.user,
          meta: { subscriptionId: String(sub._id), dateKey: target, children: names },
        });
      }
    } catch (err) {
      summary.errors++;
      console.error("[mealReminder] failed for subscription", String(sub._id), err && err.message);
    }
  }
  console.log("[mealReminder]", JSON.stringify(summary));
  return summary;
};

module.exports = { runMealReminders, missingChildrenFor, mealReminderEmail };
