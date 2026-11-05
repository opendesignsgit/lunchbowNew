const test = require("node:test");
const assert = require("node:assert/strict");
const cron = require("node-cron");
const scheduler = require("../jobs/scheduler");

test("every registered job has a valid cron expression", () => {
  for (const job of scheduler.listJobs()) {
    assert.ok(cron.validate(job.cron), `${job.name}: ${job.cron}`);
  }
  const names = scheduler.listJobs().map((j) => j.name);
  assert.deepEqual(names, ["renewalReminders", "mealReminders", "rollSubscriptionStatuses", "adminDigest", "reconcilePayments"]);
  assert.equal(scheduler.listJobs().find((j) => j.name === "mealReminders").enabled, false, "meal reminders are off by default");
});

test("runJob reports unknown jobs without throwing", async () => {
  const r = await scheduler.runJob("doesNotExist");
  assert.equal(r.ok, false);
  assert.match(r.error, /Unknown job/);
});

test("start() is a no-op when RUN_CRON=false", () => {
  const prev = process.env.RUN_CRON;
  process.env.RUN_CRON = "false";
  assert.deepEqual(scheduler.start(), []);
  if (prev == null) delete process.env.RUN_CRON;
  else process.env.RUN_CRON = prev;
});
