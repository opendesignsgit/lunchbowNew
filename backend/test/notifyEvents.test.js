const test = require("node:test");
const assert = require("node:assert/strict");
const { channelsFor, normalizeSeverity, adminEmails, EVENTS } = require("../lib/notify/events");
const { shouldNotify, resetThrottle } = require("../lib/notify/throttle");

test("channels follow severity defaults", () => {
  assert.deepEqual(channelsFor("payment.mismatch"), ["dashboard", "email", "push"]);
  assert.deepEqual(channelsFor("payment.failed"), ["dashboard", "push", "digest"]);
  assert.deepEqual(channelsFor("user.signup"), ["dashboard", "digest"]);
  assert.deepEqual(channelsFor("unknown.type"), ["dashboard", "digest"]);
  assert.deepEqual(channelsFor("user.signup", "critical"), ["dashboard", "email", "push"]);
});

test("settings override channels per type and dashboard is always kept", () => {
  const overrides = { "user.signup": ["email"], "meal.updated": [] };
  assert.deepEqual(channelsFor("user.signup", "info", overrides), ["email", "dashboard"]);
  assert.deepEqual(channelsFor("meal.updated", "info", overrides), ["dashboard"]);
  assert.deepEqual(channelsFor("payment.failed", "warning", overrides), ["dashboard", "push", "digest"]);
});

test("severity falls back to the catalogue", () => {
  assert.equal(normalizeSeverity("job.error"), "critical");
  assert.equal(normalizeSeverity("job.error", "info"), "info");
  assert.equal(normalizeSeverity("nope", "weird"), "info");
  assert.ok(Object.keys(EVENTS).length >= 19);
});

test("admin emails: settings → env → default", () => {
  const prev = process.env.ADMIN_NOTIFY_EMAILS;
  delete process.env.ADMIN_NOTIFY_EMAILS;
  assert.deepEqual(adminEmails(), ["kavirajan@opendesignsin.com"]);
  process.env.ADMIN_NOTIFY_EMAILS = "a@x.com, b@x.com";
  assert.deepEqual(adminEmails(), ["a@x.com", "b@x.com"]);
  assert.deepEqual(adminEmails(["s@x.com"]), ["s@x.com"]);
  assert.deepEqual(adminEmails([]), ["a@x.com", "b@x.com"]);
  if (prev == null) delete process.env.ADMIN_NOTIFY_EMAILS;
  else process.env.ADMIN_NOTIFY_EMAILS = prev;
});

test("throttle allows one notification per key per window", () => {
  resetThrottle();
  assert.equal(shouldNotify("k", 1000, 0), true);
  assert.equal(shouldNotify("k", 1000, 500), false);
  assert.equal(shouldNotify("other", 1000, 500), true);
  assert.equal(shouldNotify("k", 1000, 1000), true);
});
