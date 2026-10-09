const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../lib/pricing");

test("plan prices match the website's price table", () => {
  assert.equal(p.computePlanPrice(22, 1), 4950);
  assert.equal(p.computePlanPrice(66, 1), 14108);
  assert.equal(p.computePlanPrice(132, 1), 26730);
  assert.equal(p.computePlanPrice(22, 2), 9405);
  assert.equal(p.computePlanPrice(66, 2), 25245);
  assert.equal(p.computePlanPrice(132, 2), 47520);
  assert.equal(p.computePlanPrice(22, 3), 14108);
  assert.equal(p.computePlanPrice(66, 3), 37868);
  assert.equal(p.computePlanPrice(132, 3), 71280);
});

test("non-standard plan lengths get no discount", () => {
  assert.equal(p.computePlanPrice(10, 1), 2250);
});

test("wallet redemption is capped at 80% and at the balance", () => {
  assert.equal(p.maxWalletRedeem(4950, 10000), 3960);
  assert.equal(p.maxWalletRedeem(4950, 450), 450);
  assert.equal(p.maxWalletRedeem(4950, 0), 0);
});

test("working days are Monday to Friday excluding holidays", () => {
  const holidays = new Set(["2026-10-02"]); // Friday
  // Mon 2026-09-28 .. Sun 2026-10-04 → Mon–Thu = 4 working days
  assert.equal(p.countWorkingDays("2026-09-28", "2026-10-04", holidays), 4);
  assert.equal(p.nextWorkingDayKey("2026-10-02", holidays), "2026-10-05");
  assert.equal(p.dayOfWeekKey("2026-10-03"), 6);
});

test("toDateKey keeps UTC-midnight dates on their calendar day and converts others to IST", () => {
  assert.equal(p.toDateKey("2026-10-09"), "2026-10-09");
  assert.equal(p.toDateKey(new Date("2026-10-09T00:00:00Z")), "2026-10-09");
  // 20:00 UTC is 01:30 IST the next day
  assert.equal(p.toDateKey(new Date("2026-10-09T20:00:00Z")), "2026-10-10");
});
