/**
 * fix-renewal-start-date.js
 * ------------------------------------------------------------------
 * Moves a PAID renewal that landed on the wrong dates back to the start date
 * the parent actually paid for, keeping the same number of working days.
 *
 * Reported 22 Oct 2026: two parents renewed expecting to start "tomorrow"
 * (23 Oct) but the renew screen offered - and they paid for - 23 Nov -> 22 Dec.
 * The renew screen takes the LAST id in form.subscriptions as the "previous
 * plan" (any status) and starts the day after it ends; this script prints that
 * record so we can see what pushed the date.
 *
 * DRY RUN by default. Refuses to write for a parent when:
 *   - the expected child is not on that account
 *   - there is not exactly ONE paid plan sitting after the requested start
 *   - the corrected window would overlap another active/upcoming plan (--force overrides)
 *
 *   node script/fix-renewal-start-date.js --live              # dry run, both parents, LIVE (read-only)
 *   node script/fix-renewal-start-date.js --live --apply      # write to LIVE
 *   node script/fix-renewal-start-date.js 98xxxxxxxx 2026-10-23 [childName] --live   # any other parent
 *   ... --sub=<subscriptionId>                                # pick the plan to move explicitly
 *
 * Output is also written to script/logs/, and on --apply a JSON backup of each
 * touched subscription + UserMeal goes to script/backups/ BEFORE any write.
 * Meals already picked outside the corrected window are removed (they would
 * otherwise still show up as kitchen orders) - they are in the backup.
 * ------------------------------------------------------------------
 */
require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Subscription = require("../models/subscriptionModel");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const UserMeal = require("../models/UserMeal");
const Holiday = require("../models/holidaySchema");

// ---- the two parents reported on 22 Oct 2026 ----
const DEFAULT_JOBS = [
  { phone: "9841558749", child: "Alagammai", start: "2026-10-23", note: "Annalakshmi C (parent)" },
  { phone: "9020070101", child: "Vyas", start: "2026-10-23", note: "child Vyas Vijayaraghavan" },
];

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const SUB_ARG = (argv.find((a) => a.startsWith("--sub=")) || "").slice(6) || null;
const positional = argv.filter((a) => !a.startsWith("--"));
const JOBS = positional.length
  ? [{ phone: positional[0], start: positional[1], child: positional[2] || null, note: "ad hoc" }]
  : DEFAULT_JOBS;

// ---- which database (same rules as the other repair scripts) ----
const uriArg = argv.find((a) => a.startsWith("--uri="));
const wantLive = argv.includes("--live");
let URI, TARGET_LABEL;
if (uriArg) { URI = uriArg.slice(6); TARGET_LABEL = "explicit --uri"; }
else if (wantLive && process.env.MONGO_SOURCE_URI) { URI = process.env.MONGO_SOURCE_URI; TARGET_LABEL = "MONGO_SOURCE_URI (live)"; }
else if (wantLive) { URI = process.env.MONGO_URI; TARGET_LABEL = "MONGO_URI (no MONGO_SOURCE_URI here - this is normal on the server)"; }
else { URI = process.env.MONGO_URI; TARGET_LABEL = "MONGO_URI"; }
const isLocal = /localhost|127\.0\.0\.1/.test(URI || "");

// ---- tee console output into a log file ----
const STAMP = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19).replace(/[:T]/g, "-");
const LOG_DIR = path.join(__dirname, "logs");
const BACKUP_DIR = path.join(__dirname, "backups");
const logLines = [];
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x, null, 2))).join(" "); logLines.push(s); console.log(s); };
const flushLog = () => {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const f = path.join(LOG_DIR, `fix-renewal-start-date-${APPLY ? "apply" : "dryrun"}-${STAMP}.log`);
    fs.writeFileSync(f, logLines.join("\n") + "\n", "utf8");
    console.log(`\nLog written: ${f}`);
  } catch (e) { console.error("Could not write log file:", e.message); }
};

// ---- dates: the site shows calendar days in IST; the renew flow stores "YYYY-MM-DD" as UTC midnight ----
const IST_MS = 330 * 60000;
const DAY_MS = 86400000;
const ymd = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const dateOnly = (s) => new Date(`${s}T00:00:00.000Z`);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY_MS);
const isWeekend = (d) => [0, 6].includes(new Date(new Date(d).getTime() + IST_MS).getUTCDay());
const isWorkingDay = (d, hol) => !isWeekend(d) && !hol.has(ymd(d));
const nextWorkingDay = (d, hol) => { let c = new Date(d); while (!isWorkingDay(c, hol)) c = addDays(c, 1); return c; };
// same algorithm as calculateEndDateByWorkingDays() in RenewSubscriptionPlanStep.js
const endByWorkingDays = (start, days, hol) => {
  let c = nextWorkingDay(start, hol), n = 0;
  while (n < days) { if (isWorkingDay(c, hol)) n++; if (n < days) c = addDays(c, 1); }
  while (!isWorkingDay(c, hol)) c = addDays(c, 1);
  return c;
};
const countWorkingDays = (start, end, hol) => { let n = 0; for (let c = new Date(start); ymd(c) <= ymd(end); c = addDays(c, 1)) if (isWorkingDay(c, hol)) n++; return n; };
const created = (s) => (s.createdAt ? new Date(s.createdAt) : s._id.getTimestamp());
const LIVE_STATUSES = ["active", "upcoming"];

async function findUser(phone) {
  const variants = [String(phone), "+91" + phone];
  let users = await Customer.find({ phone: { $in: variants } }).lean();
  if (users.length) return { users, via: "customers.phone" };
  const forms = await Form.find({ "parentDetails.mobile": String(phone) }).select("user").lean();
  users = forms.length ? await Customer.find({ _id: { $in: forms.map((f) => f.user) } }).lean() : [];
  return { users, via: "forms.parentDetails.mobile" };
}

async function runJob(job, hol) {
  const head = `${job.phone}  (${job.note || ""})`;
  log("\n" + "#".repeat(72) + `\n# ${head}\n` + "#".repeat(72));
  const problems = [];

  if (!/^\d{10}$/.test(job.phone || "")) return log(`SKIP: bad phone "${job.phone}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.start || "")) return log(`SKIP: start date must be YYYY-MM-DD, got "${job.start}"`);

  const { users, via } = await findUser(job.phone);
  if (users.length !== 1) return log(`SKIP: ${users.length} customer accounts match ${job.phone} (via ${via}) - resolve manually.`);
  const u = users[0];
  log(`Parent : ${u.name || "(no name)"}  ${u.email || ""}  _id ${u._id}  (matched on ${via})`);

  const kids = await Child.find({ user: u._id }).lean();
  kids.forEach((k) => log(`Child  : ${k.childFirstName} ${k.childLastName} - ${k.school || ""} ${k.childClass || ""}-${k.section || ""} (${k._id})`));
  if (job.child && !kids.some((k) => `${k.childFirstName} ${k.childLastName}`.toLowerCase().includes(job.child.toLowerCase()))) {
    problems.push(`expected child "${job.child}" is not on this account - wrong phone number?`);
  }

  const form = await Form.findOne({ user: u._id }).select("subscriptions wallet").lean();
  const formIds = ((form && form.subscriptions) || []).map(String);

  const subs = await Subscription.find({ user: u._id }).sort({ startDate: 1 }).lean();

  const wantStart = nextWorkingDay(dateOnly(job.start), hol);
  if (ymd(wantStart) !== job.start) log(`Note: ${job.start} is not a working day - using ${ymd(wantStart)}.`);

  // ---- which plan to move ----
  let target;
  if (SUB_ARG) {
    target = subs.find((s) => String(s._id) === SUB_ARG);
    if (!target) problems.push(`--sub=${SUB_ARG} is not one of this parent's subscriptions`);
  } else {
    const paid = subs.filter((s) => LIVE_STATUSES.includes(s.status) && s.orderId);
    const already = paid.filter((s) => ymd(s.startDate) === ymd(wantStart));
    const candidates = paid.filter((s) => ymd(s.startDate) > ymd(wantStart));
    if (!candidates.length && already.length) {
      log(`\nALREADY FIXED: paid plan ${already[0]._id} already starts ${ymd(wantStart)} (${ymd(already[0].startDate)} -> ${ymd(already[0].endDate)}). Nothing to do.`);
      return;
    }
    if (candidates.length !== 1) {
      problems.push(`expected exactly 1 paid active/upcoming plan starting after ${ymd(wantStart)}, found ${candidates.length}` +
        (candidates.length ? ` (${candidates.map((s) => s._id).join(", ")}) - re-run with --sub=<id>` : ""));
    } else target = candidates[0];
  }

  // The renew screen starts the day after the plan linked just BEFORE the new one in
  // form.subscriptions (whatever its status) - flag it, it is what pushed the date.
  const tIdx = target ? formIds.indexOf(String(target._id)) : formIds.length;
  const prevFormId = [...formIds.slice(0, tIdx < 0 ? formIds.length : tIdx)].reverse().find((id) => mongoose.Types.ObjectId.isValid(id)) || null;
  log(`\nSubscriptions (${subs.length}):`);
  subs.forEach((s) => {
    const tags = [];
    if (target && String(s._id) === String(target._id)) tags.push("<= PLAN TO MOVE");
    if (String(s._id) === prevFormId) tags.push("<= renew screen started after THIS plan");
    if (!formIds.includes(String(s._id))) tags.push("(not linked in form.subscriptions)");
    log(`  ${s._id}  ${String(s.status).padEnd(15)} ${ymd(s.startDate)} -> ${ymd(s.endDate)}  ${s.workingDays}d  Rs.${s.price}` +
      `  order ${s.orderId || "-"}  paid ${s.paymentDate ? ymd(s.paymentDate) : "-"}  created ${created(s).toISOString()}  ${tags.join(" ")}`);
  });
  log(`form.subscriptions order: ${formIds.join(", ") || "(empty)"}`);
  if (!target) { log("\nNOT CHANGED:\n  - " + problems.join("\n  - ")); return; }

  const newEnd = endByWorkingDays(wantStart, target.workingDays, hol);
  const check = countWorkingDays(wantStart, newEnd, hol);
  log(`\nPlan to move : ${target._id}  status "${target.status}"  order ${target.orderId}  Rs.${target.price}`);
  log(`  now        : ${ymd(target.startDate)} -> ${ymd(target.endDate)}  (${target.workingDays} working days)`);
  log(`  corrected  : ${ymd(wantStart)} -> ${ymd(newEnd)}  (${check} working days counted, ${hol.size} holidays loaded)`);
  if (check !== target.workingDays) problems.push(`working-day check failed (${check} != ${target.workingDays})`);

  const overlaps = subs.filter((s) => String(s._id) !== String(target._id) && LIVE_STATUSES.includes(s.status) &&
    ymd(s.startDate) <= ymd(newEnd) && ymd(s.endDate) >= ymd(wantStart));
  overlaps.forEach((s) => log(`  OVERLAP    : ${s._id} ${s.status} ${ymd(s.startDate)} -> ${ymd(s.endDate)} order ${s.orderId || "-"}`));
  if (overlaps.length && !FORCE) problems.push(`corrected window overlaps ${overlaps.length} other active/upcoming plan(s) - check them; --force to move anyway`);

  const pending = subs.filter((s) => s.status === "pending_payment");
  if (pending.length) log(`  pending    : ${pending.length} pending_payment row(s) - abandoned checkouts, the site deletes them after 180 min; not touched.`);

  // ---- meals already picked against this plan ----
  const um = await UserMeal.findOne({ userId: u._id });
  const plan = um && um.plans.find((p) => p.planId === String(target._id));
  const inWindow = (m) => ymd(m.mealDate) >= ymd(wantStart) && ymd(m.mealDate) <= ymd(newEnd);
  let kept = 0; const dropped = [];
  if (plan) plan.children.forEach((c) => c.meals.forEach((m) => (inWindow(m) ? kept++ : dropped.push(`${ymd(m.mealDate)} ${m.mealName}${m.deleted ? " (deleted)" : ""} [child ${c.childId}]`))));
  log(`  meals      : ${plan ? `${kept} inside corrected window, ${dropped.length} outside (will be removed)` : "none picked yet"}`);
  dropped.forEach((d) => log(`               - ${d}`));

  if (problems.length) { log("\nNOT CHANGED:\n  - " + problems.join("\n  - ")); return; }
  if (!APPLY) { log("\nOK - would move this plan. DRY RUN, nothing written."); return; }

  // ---- write ----
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const bf = path.join(BACKUP_DIR, `renewal-dates-${job.phone}-${STAMP}.json`);
  fs.writeFileSync(bf, JSON.stringify({ subscription: target, userMeal: um ? um.toObject() : null }, null, 2), "utf8");
  log(`\nBackup     : ${bf}`);

  const res = await Subscription.updateOne(
    { _id: target._id, startDate: target.startDate, endDate: target.endDate },
    { $set: { startDate: wantStart, endDate: newEnd } }
  );
  if (!(res.nModified || res.modifiedCount)) { log("NOT CHANGED: subscription was modified by someone else since it was read - re-run."); return; }
  log(`Subscription ${target._id} -> ${ymd(wantStart)} .. ${ymd(newEnd)}  DONE`);

  if (dropped.length) {
    plan.children.forEach((c) => { c.meals = c.meals.filter(inWindow); });
    um.markModified("plans");
    await um.save();
    log(`Removed ${dropped.length} meal(s) outside the corrected window.`);
  }
  log(`Status stays "${target.status}" - an upcoming plan turns active on its start date when the parent opens the calendar.`);
}

(async () => {
  if (!URI) throw new Error("No Mongo URI resolved. On your PC --live needs MONGO_SOURCE_URI in backend/.env.local; on the server run without --live, or pass --uri=<connection string>.");
  await mongoose.connect(URI, { useNewUrlParser: true, useUnifiedTopology: true });
  log(`DB:   ${String(URI).replace(/\/\/[^@]*@/, "//***@")}`);
  log(`From: ${TARGET_LABEL}${isLocal ? "" : "   *** REMOTE database ***"}`);
  log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}${FORCE ? " + FORCE" : ""}`);

  const hol = new Set((await Holiday.find({}).lean()).map((h) => ymd(h.date)));
  for (const job of JOBS) {
    try { await runJob(job, hol); } catch (e) { log(`ERROR for ${job.phone}: ${e.stack || e.message}`); }
  }
  await mongoose.disconnect();
  flushLog();
})().catch(async (e) => {
  log("\nERROR: " + e.message);
  try { await mongoose.disconnect(); } catch (_) {}
  flushLog();
  process.exit(1);
});
