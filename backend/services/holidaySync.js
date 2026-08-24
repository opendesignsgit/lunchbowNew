/**
 * holidaySync.js  (Lunchbowl STANDARD — child-aware)
 * ------------------------------------------------------------------
 * Keeps existing subscriptions consistent when holidays change.
 *
 * Business rules (confirmed):
 *   - ADD a holiday on a working day -> every active/upcoming subscription that
 *     spans that day loses a delivery day, so we EXTEND its end date by one
 *     working day and PULL the meal chosen for that day (per child) to the new
 *     end day, carrying the dish. Only future, undelivered meals are touched.
 *   - DELETE a holiday -> FORWARD-ONLY. Existing subscriptions are NOT changed.
 *
 * STANDARD difference vs PRO: meals are nested per child
 *   UserMeal.plans[].children[].meals[]   (Pro is flat: plans[].meals[])
 * so the move is applied to EACH child entry in the plan.
 *
 * All date math is UTC-midnight. Idempotent via subscription.holidayAdjustments.
 * ------------------------------------------------------------------
 */
const Subscription = require("../models/subscriptionModel");
const UserMeal = require("../models/UserMeal");
const Holiday = require("../models/holidaySchema");
const Customer = require("../models/Customer");

// ---- date helpers (UTC) ----
const toUTCDate = (s) => {
  const d = new Date(s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const isWeekend = (d) => {
  const w = new Date(d).getUTCDay();
  return w === 0 || w === 6;
};
const isWorkingDay = (d, holidaySet) => !isWeekend(d) && !holidaySet.has(ymd(d));
const nextWorkingDayAfter = (d, holidaySet) => {
  let cur = addDays(toUTCDate(d), 1);
  while (!isWorkingDay(cur, holidaySet)) cur = addDays(cur, 1);
  return cur;
};

async function buildHolidaySet(extraYmd) {
  const holidays = await Holiday.find({}).lean();
  const set = new Set(holidays.map((h) => ymd(h.date)));
  if (extraYmd) set.add(extraYmd);
  return set;
}

/**
 * Dry-run: impact of ADDING a holiday on `dateStr`. Writes nothing.
 * Returns { date, weekend, past, affectedCount, changes:[...] }.
 * Each change: { subscriptionId, user, orderId, endDateBefore, endDateAfter,
 *                mealsMoved:[{childId, from, to, mealName}], customerName, phone }
 */
async function planHolidayAdd(dateStr) {
  const D = toUTCDate(dateStr);
  const Dymd = ymd(D);
  const today = toUTCDate(new Date());
  const weekend = isWeekend(D);
  const past = D < today;

  if (weekend || past) {
    return { date: Dymd, weekend, past, affectedCount: 0, changes: [] };
  }

  const holidaySet = await buildHolidaySet(Dymd);

  const subs = await Subscription.find({
    status: { $in: ["active", "upcoming"] },
    startDate: { $lte: D },
    endDate: { $gte: D },
  }).lean();

  const changes = [];
  for (const sub of subs) {
    const already = (sub.holidayAdjustments || []).some(
      (a) => a.date === Dymd && a.action === "add"
    );
    if (already) continue;

    const newEnd = nextWorkingDayAfter(sub.endDate, holidaySet);

    // Which children have a meal chosen for D under this subscription's plan?
    const mealsMoved = [];
    const um = await UserMeal.findOne({ userId: sub.user }).lean();
    if (um) {
      const plan = (um.plans || []).find((p) => p.planId === String(sub._id));
      if (plan) {
        for (const child of plan.children || []) {
          const meal = (child.meals || []).find(
            (m) => ymd(m.mealDate) === Dymd && !m.deleted
          );
          if (meal) {
            mealsMoved.push({
              childId: String(child.childId),
              from: Dymd,
              to: ymd(newEnd),
              mealName: meal.mealName,
            });
          }
        }
      }
    }

    changes.push({
      subscriptionId: String(sub._id),
      user: String(sub.user),
      orderId: sub.orderId || "",
      endDateBefore: sub.endDate,
      endDateAfter: newEnd,
      mealsMoved,
    });
  }

  // enrich with customer name/phone for the admin preview
  const ids = [...new Set(changes.map((c) => c.user))];
  const customers = await Customer.find({ _id: { $in: ids } })
    .select("name phone")
    .lean();
  const cmap = {};
  customers.forEach((c) => (cmap[String(c._id)] = c));
  changes.forEach((c) => {
    c.customerName = cmap[c.user]?.name || "";
    c.phone = cmap[c.user]?.phone || "";
  });

  return { date: Dymd, weekend, past, affectedCount: changes.length, changes };
}

/**
 * Apply the ADD adjustment for real. Idempotent. Returns { date, applied }.
 */
async function applyHolidayAdd(dateStr) {
  const Dymd = ymd(toUTCDate(dateStr));
  const holidaySet = await buildHolidaySet(Dymd);
  const plan = await planHolidayAdd(dateStr);

  let applied = 0;
  for (const ch of plan.changes) {
    const sub = await Subscription.findById(ch.subscriptionId);
    if (!sub) continue;
    if (
      (sub.holidayAdjustments || []).some(
        (a) => a.date === Dymd && a.action === "add"
      )
    )
      continue;

    const endBefore = sub.endDate;
    const newEnd = nextWorkingDayAfter(sub.endDate, holidaySet);

    // Move each child's meal chosen for D to the new end day (carry the dish).
    const um = await UserMeal.findOne({ userId: sub.user });
    if (um) {
      const p = (um.plans || []).find((pp) => pp.planId === String(sub._id));
      if (p) {
        for (const child of p.children || []) {
          const idx = (child.meals || []).findIndex(
            (m) => ymd(m.mealDate) === Dymd && !m.deleted
          );
          if (idx !== -1) {
            const movedName = child.meals[idx].mealName;
            child.meals.splice(idx, 1); // remove from holiday (not a cancellation)
            child.meals.push({
              mealDate: newEnd,
              mealName: movedName,
              deleted: false,
            });
          }
        }
        await um.save();
      }
    }

    sub.endDate = newEnd;
    sub.holidayAdjustments = sub.holidayAdjustments || [];
    sub.holidayAdjustments.push({
      date: Dymd,
      action: "add",
      endDateBefore: endBefore,
      endDateAfter: newEnd,
      appliedAt: new Date(),
    });
    await sub.save({ validateModifiedOnly: true });
    applied++;
  }
  return { date: Dymd, applied };
}

/** Forward-only: deleting a holiday never changes existing subscriptions. */
async function planHolidayDelete(dateStr) {
  return {
    date: ymd(toUTCDate(dateStr)),
    forwardOnly: true,
    affectedCount: 0,
    changes: [],
    note: "Deletion is forward-only: existing subscriptions keep their current end date. Only new subscriptions and the future calendar use the freed-up day.",
  };
}

module.exports = {
  planHolidayAdd,
  applyHolidayAdd,
  planHolidayDelete,
  _helpers: { toUTCDate, ymd, addDays, isWeekend, isWorkingDay, nextWorkingDayAfter },
};
