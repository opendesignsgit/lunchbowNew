/**
 * Registers every background job with node-cron (IST) and exposes runJob(name)
 * for POST /api/jobs/:name (external cron / Vercel cron / manual runs).
 *
 *   RUN_CRON=false              disable in-process crons (use the HTTP endpoint instead)
 *   RENEWAL_REMINDER_CRON       default "0 9 * * *"   (09:00 IST)
 *   MEAL_REMINDER_ENABLED=true  turn the meal reminder on; MEAL_REMINDER_CRON default "0 18 * * *"
 *   ADMIN_DIGEST_CRON           default "0 19 * * *"  (19:00 IST)
 *   ROLL_SUBSCRIPTIONS_CRON     default "15 0 * * *"  (00:15 IST)
 *   RECONCILE_PAYMENTS_CRON     default every 10 minutes
 *
 * Every run is wrapped: a failing job logs, raises a job.error admin notification and
 * never takes the server down.
 */
const cron = require("node-cron");
const { notifyAdmin } = require("../lib/notify");

const TIMEZONE = "Asia/Kolkata";

const envFlag = (key, def) => {
  const v = process.env[key];
  return v == null || v === "" ? def : v === "true" || v === "1";
};

// Job modules are required lazily so a broken job cannot stop the API from booting.
const JOBS = {
  renewalReminders: {
    description: "Email + SMS renewal reminders (settings.renewalReminderDays)",
    cron: () => process.env.RENEWAL_REMINDER_CRON || "0 9 * * *",
    enabled: () => true,
    run: () => require("./renewalReminder").runRenewalReminders(),
  },
  mealReminders: {
    description: "Email parents with no meal booked for the next working day",
    cron: () => process.env.MEAL_REMINDER_CRON || "0 18 * * *",
    enabled: () => envFlag("MEAL_REMINDER_ENABLED", false),
    run: () => require("./mealReminder").runMealReminders(),
  },
  rollSubscriptionStatuses: {
    description: "Expire ended plans and activate the next upcoming plan",
    cron: () => process.env.ROLL_SUBSCRIPTIONS_CRON || "15 0 * * *",
    enabled: () => true,
    run: () => require("./rollSubscriptionStatuses").runRollSubscriptionStatuses(),
  },
  adminDigest: {
    description: "Daily digest email of un-emailed admin notifications",
    cron: () => process.env.ADMIN_DIGEST_CRON || "0 19 * * *",
    enabled: () => true,
    run: () => require("./adminDigest").runAdminDigest(),
  },
  reconcilePayments: {
    description: "Settle payments whose gateway callback never arrived (CCAvenue status API), expire old intents, alert unreconciled",
    cron: () => process.env.RECONCILE_PAYMENTS_CRON || "*/10 * * * *",
    enabled: () => true,
    run: () => require("./reconcilePayments").runReconcilePayments(),
  },
};

const lastRuns = {};
const running = new Set();
const tasks = new Map();

const listJobs = () =>
  Object.entries(JOBS).map(([name, j]) => ({
    name,
    description: j.description,
    cron: j.cron(),
    enabled: j.enabled(),
    scheduled: tasks.has(name),
    running: running.has(name),
    lastRun: lastRuns[name] || null,
  }));

/** Runs one job with logging + job.error notification. Resolves to { ok, name, result | error }. */
const runJob = async (name, { trigger = "manual" } = {}) => {
  const job = JOBS[name];
  if (!job) return { ok: false, name, error: `Unknown job "${name}"` };
  if (running.has(name)) return { ok: false, name, error: "Job is already running" };
  running.add(name);
  const startedAt = new Date();
  console.log(`[jobs] ${name} started (${trigger})`);
  try {
    const result = await job.run();
    lastRuns[name] = { startedAt, finishedAt: new Date(), ok: true, trigger, result };
    console.log(`[jobs] ${name} finished in ${Date.now() - startedAt.getTime()}ms`);
    return { ok: true, name, result };
  } catch (err) {
    const message = (err && err.message) || String(err);
    lastRuns[name] = { startedAt, finishedAt: new Date(), ok: false, trigger, error: message };
    console.error(`[jobs] ${name} FAILED:`, err);
    notifyAdmin({
      type: "job.error",
      title: `Job failed: ${name}`,
      message,
      meta: { job: name, trigger, stack: err && err.stack ? String(err.stack).slice(0, 2000) : undefined },
    });
    return { ok: false, name, error: message };
  } finally {
    running.delete(name);
  }
};

/** Registers the crons. No-op when RUN_CRON=false or when already started. */
const start = () => {
  if (process.env.RUN_CRON === "false") {
    console.log("[jobs] RUN_CRON=false — in-process crons disabled (use POST /api/jobs/:name)");
    return [];
  }
  for (const [name, job] of Object.entries(JOBS)) {
    if (tasks.has(name)) continue;
    if (!job.enabled()) {
      console.log(`[jobs] ${name} disabled`);
      continue;
    }
    const expr = job.cron();
    if (!cron.validate(expr)) {
      console.error(`[jobs] ${name}: invalid cron "${expr}" — not scheduled`);
      continue;
    }
    try {
      const task = cron.schedule(expr, () => runJob(name, { trigger: "cron" }).catch(() => {}), { timezone: TIMEZONE });
      tasks.set(name, task);
      console.log(`[jobs] ${name} scheduled "${expr}" (${TIMEZONE})`);
    } catch (err) {
      console.error(`[jobs] ${name}: could not schedule:`, err && err.message);
    }
  }
  return Array.from(tasks.keys());
};

const stop = () => {
  for (const task of tasks.values()) {
    try {
      task.stop();
    } catch (err) {
      // ignore
    }
  }
  tasks.clear();
};

module.exports = { JOBS, start, stop, runJob, listJobs, TIMEZONE };
