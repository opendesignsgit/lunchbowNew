/**
 * Kitchen / dispatch sheet rows.
 *
 * One place that decides which meals the kitchen should see:
 *  - only meals of plans that are active or upcoming AND paid (a plan is paid when it
 *    has a payment date, or its form's paymentStatus is Success for plans created
 *    before payment dates were stored);
 *  - dates compared as India calendar days (website saves local-midnight timestamps,
 *    the app saves "YYYY-MM-DD");
 *  - cancelled meals are returned flagged `deleted` (never silently dropped) and left
 *    out of prep counts;
 *  - paid Saturday/holiday meals are flagged `holidayPaid`.
 */
const UserMeal = require("../models/UserMeal");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const HolidayPayment = require("../models/HolidayPayment");
const { toDateKey } = require("./pricing");

/** Map of planId (subscription _id as string) → { userId, status } for paid, live plans. */
async function loadServablePlans() {
  const subs = await Subscription.find({ status: { $in: ["active", "upcoming"] } })
    .select("_id user status paymentDate startDate endDate")
    .lean();
  if (subs.length === 0) return new Map();

  const unpaidUsers = subs.filter((s) => !s.paymentDate).map((s) => s.user);
  const paidForms = new Set(
    unpaidUsers.length
      ? (
          await Form.find({ user: { $in: unpaidUsers }, paymentStatus: "Success" })
            .select("user")
            .lean()
        ).map((f) => String(f.user))
      : []
  );

  const plans = new Map();
  for (const s of subs) {
    if (s.paymentDate || paidForms.has(String(s.user))) {
      plans.set(String(s._id), {
        userId: String(s.user),
        status: s.status,
        startKey: toDateKey(s.startDate),
        endKey: toDateKey(s.endDate),
      });
    }
  }
  return plans;
}

/**
 * Flattened rows. Options:
 *  - fromKey / toKey: inclusive "YYYY-MM-DD" range (either may be omitted)
 *  - childName: case-insensitive substring of "first last"
 *  - school / lunchTime / location: exact match filters
 */
async function buildKitchenRows(options = {}) {
  const { fromKey, toKey, childName, school, lunchTime, location } = options;
  const plans = await loadServablePlans();
  if (plans.size === 0) return [];

  const userIds = [...new Set([...plans.values()].map((p) => p.userId))];
  const userMeals = await UserMeal.find({ userId: { $in: userIds } }).lean();

  const childIds = new Set();
  for (const um of userMeals) {
    for (const plan of um.plans || []) {
      if (!plans.has(String(plan.planId))) continue;
      for (const c of plan.children || []) if (c.childId) childIds.add(String(c.childId));
    }
  }
  const children = await Child.find({ _id: { $in: [...childIds] } }).lean();
  const childById = new Map(children.map((c) => [String(c._id), c]));

  const rows = [];
  for (const um of userMeals) {
    const userId = String(um.userId);
    for (const plan of um.plans || []) {
      const live = plans.get(String(plan.planId));
      if (!live) continue;
      for (const entry of plan.children || []) {
        const childId = entry.childId ? String(entry.childId) : null;
        if (!childId) continue;
        const child = childById.get(childId);
        for (const meal of entry.meals || []) {
          if (!meal.mealDate || !meal.mealName) continue;
          const dateKey = toDateKey(meal.mealDate);
          if (!dateKey) continue;
          if (fromKey && dateKey < fromKey) continue;
          if (toKey && dateKey > toKey) continue;
          rows.push({
            userId,
            planId: String(plan.planId),
            planStatus: live.status,
            childId,
            dateKey,
            date: meal.mealDate,
            food: meal.mealName,
            deleted: !!meal.deleted,
            holidayPaid: false,
            childFirstName: child?.childFirstName || "",
            childLastName: child?.childLastName || "",
            school: child?.school || "",
            lunchTime: child?.lunchTime || "",
            location: child?.location || "",
            childClass: child?.childClass || "",
            section: child?.section || "",
            allergies: child?.allergies || "",
          });
        }
      }
    }
  }

  // Paid Saturday/holiday meals (per child and date)
  const dateKeys = [...new Set(rows.map((r) => r.dateKey))];
  if (dateKeys.length) {
    const paid = await HolidayPayment.find({
      userId: { $in: userIds },
      mealDate: { $in: dateKeys },
      paymentStatus: "Paid",
    })
      .select("userId childId mealDate")
      .lean();
    const paidSet = new Set(paid.map((p) => `${p.userId}|${p.childId}|${p.mealDate}`));
    for (const r of rows) {
      if (paidSet.has(`${r.userId}|${r.childId}|${r.dateKey}`)) r.holidayPaid = true;
    }
  }

  let out = rows;
  if (childName) {
    const q = String(childName).toLowerCase();
    out = out.filter((r) => `${r.childFirstName} ${r.childLastName}`.toLowerCase().includes(q));
  }
  if (school) out = out.filter((r) => r.school === school);
  if (lunchTime) out = out.filter((r) => r.lunchTime === lunchTime);
  if (location) out = out.filter((r) => r.location === location);

  out.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      a.school.localeCompare(b.school) ||
      a.lunchTime.localeCompare(b.lunchTime) ||
      a.childFirstName.localeCompare(b.childFirstName)
  );
  return out;
}

/** Dish → count, cancelled meals excluded. */
function dishSummary(rows) {
  const counts = {};
  for (const r of rows) {
    if (r.deleted) continue;
    counts[r.food] = (counts[r.food] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([dish, count]) => ({ dish, count }))
    .sort((a, b) => b.count - a.count);
}

/** School → lunch slot → rows + counts, for printing and dispatch. */
function groupForDispatch(rows) {
  const schools = new Map();
  for (const r of rows) {
    const schoolKey = r.school || "Unknown school";
    if (!schools.has(schoolKey)) schools.set(schoolKey, { school: schoolKey, slots: new Map(), total: 0, cancelled: 0 });
    const s = schools.get(schoolKey);
    const slotKey = r.lunchTime || "No slot";
    if (!s.slots.has(slotKey)) s.slots.set(slotKey, { lunchTime: slotKey, rows: [], total: 0, cancelled: 0 });
    const slot = s.slots.get(slotKey);
    slot.rows.push(r);
    if (r.deleted) {
      slot.cancelled++;
      s.cancelled++;
    } else {
      slot.total++;
      s.total++;
    }
  }
  return [...schools.values()]
    .map((s) => ({
      school: s.school,
      total: s.total,
      cancelled: s.cancelled,
      dishSummary: dishSummary([...s.slots.values()].flatMap((x) => x.rows)),
      slots: [...s.slots.values()].map((slot) => ({
        ...slot,
        dishSummary: dishSummary(slot.rows),
      })),
    }))
    .sort((a, b) => a.school.localeCompare(b.school));
}

const CSV_COLUMNS = [
  ["Date", (r) => r.dateKey],
  ["Status", (r) => (r.deleted ? "CANCELLED - DO NOT DISPATCH" : r.holidayPaid ? "Paid extra day" : "Active")],
  ["School", (r) => r.school],
  ["Location", (r) => r.location],
  ["Lunch time", (r) => r.lunchTime],
  ["Child", (r) => `${r.childFirstName} ${r.childLastName}`.trim()],
  ["Class", (r) => r.childClass],
  ["Section", (r) => r.section],
  ["Dish", (r) => r.food],
  ["Allergies", (r) => r.allergies],
];

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.map(([h]) => h).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, f]) => esc(f(r))).join(","));
  return lines.join("\n");
}

module.exports = { loadServablePlans, buildKitchenRows, dishSummary, groupForDispatch, toCsv };
