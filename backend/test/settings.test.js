const test = require("node:test");
const assert = require("node:assert/strict");
const { deepMerge, getAll, reset } = require("../lib/settingsStore");
const { validateSettingsPatch } = require("../lib/settingsSchema");
const { getPricingConfig } = require("../lib/pricing");

test("deepMerge merges nested objects, replaces arrays and ignores null/undefined", () => {
  const base = { a: 1, n: { x: 1, y: 2 }, list: [1, 2] };
  const out = deepMerge(base, { a: 2, n: { y: 3 }, list: [9], z: null });
  assert.deepEqual(out, { a: 2, n: { x: 1, y: 3 }, list: [9] });
  assert.deepEqual(base, { a: 1, n: { x: 1, y: 2 }, list: [1, 2] }, "base is not mutated");
});

test("getPricingConfig returns env defaults with an empty cache", () => {
  reset();
  assert.deepEqual(getAll(), {});
  const cfg = getPricingConfig();
  assert.equal(cfg.pricePerDayPerChild, 225);
  assert.deepEqual(cfg.renewalReminderDays, [7, 3, 1]);
  assert.equal(cfg.mealCutoffTime, "21:00");
  assert.equal(typeof cfg.trialEnabled, "boolean");
});

test("validateSettingsPatch accepts valid values and flattens nested groups", () => {
  const r = validateSettingsPatch({
    pricePerDayPerChild: "250",
    planDurations: { oneMonth: 20 },
    renewalReminderDays: [1, 7, 3, 3],
    adminNotifyEmails: "a@b.com, c@d.com",
    trialEnabled: "true",
    mealCutoffTime: "20:30",
    notificationChannels: { "payment.failed": ["email", "push"] },
    supportPhone: null,
  });
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(r.flat.pricePerDayPerChild, 250);
  assert.equal(r.flat["planDurations.oneMonth"], 20);
  assert.deepEqual(r.flat.renewalReminderDays, [7, 3, 1]);
  assert.deepEqual(r.flat.adminNotifyEmails, ["a@b.com", "c@d.com"]);
  assert.equal(r.flat.trialEnabled, true);
  assert.equal(r.flat.supportPhone, null);
  assert.deepEqual(r.flat.notificationChannels, { "payment.failed": ["email", "push"] });
});

test("validateSettingsPatch rejects bad numbers, percentages, times and unknown keys", () => {
  const r = validateSettingsPatch({
    walletMaxRedeemPercent: 150,
    "planDurations.threeMonths": 1.5,
    mealCutoffTime: "9pm",
    adminNotifyEmails: ["nope"],
    notificationChannels: { "made.up": ["email"] },
    somethingElse: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 6);
  assert.ok(r.errors.some((e) => e.startsWith("walletMaxRedeemPercent")));
  assert.ok(r.errors.some((e) => e.includes("unknown setting")));
  assert.equal(validateSettingsPatch({}).ok, false);
});
