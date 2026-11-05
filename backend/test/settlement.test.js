const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeGatewayResponse, legacyIntentFields } = require("../lib/payments/settlement");
const { mapGatewayStatus, parseEnvelope } = require("../lib/ccavenueStatus");
const { redirectUrlFor } = require("../lib/payments/redirects");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

test("normalizeGatewayResponse coerces amount and keeps merchant params", () => {
  const r = normalizeGatewayResponse({ order_id: " LB1 ", order_status: "Success", amount: "4950.00", merchant_param1: "u1", tracking_id: "T" });
  assert.equal(r.orderId, "LB1");
  assert.equal(r.amount, 4950);
  assert.equal(r.userId, "u1");
  assert.equal(normalizeGatewayResponse({}).orderStatus, "Unknown");
  assert.equal(normalizeGatewayResponse({ amount: "abc" }).amount, null);
});

test("legacy website callbacks map to the right intent type", () => {
  const oid = "507f1f77bcf86cd799439011";
  assert.equal(legacyIntentFields(normalizeGatewayResponse({ order_id: "LB123" })).type, "subscription");
  assert.equal(legacyIntentFields(normalizeGatewayResponse({ order_id: "RENEW123", merchant_param4: "500" })).meta.walletUsed, 500);
  assert.equal(legacyIntentFields(normalizeGatewayResponse({ order_id: "RENEW123" })).type, "renewal");
  const h = legacyIntentFields(normalizeGatewayResponse({ order_id: "LB-HOLIDAY-1", merchant_param2: "2026-10-10", merchant_param3: b64([{ childId: "c" }]) }));
  assert.equal(h.type, "holiday");
  assert.equal(h.meta.childrenData.length, 1);
  const a = legacyIntentFields(normalizeGatewayResponse({ order_id: "LB9", merchant_param2: oid, merchant_param3: b64([{ childFirstName: "A" }]) }));
  assert.equal(a.type, "addChild");
  assert.equal(a.meta.subscriptionId, oid);
  assert.equal(legacyIntentFields(normalizeGatewayResponse({ order_id: "XYZ" })).type, null);
});

test("CCAvenue status wording maps to settlement statuses", () => {
  assert.equal(mapGatewayStatus("Successful"), "Success");
  assert.equal(mapGatewayStatus("Shipped"), "Success");
  assert.equal(mapGatewayStatus("Unsuccessful"), "Failure");
  assert.equal(mapGatewayStatus("Aborted"), "Aborted");
  assert.equal(mapGatewayStatus("Initiated"), "Pending");
  assert.equal(mapGatewayStatus(""), "Pending");
  assert.deepEqual({ ...parseEnvelope("status=0&enc_response=abc") }, { status: "0", enc_response: "abc" });
});

test("redirects: app → app-result, web → store pages with order id", () => {
  const req = { get: () => "api.test", protocol: "https" };
  process.env.API_PUBLIC_URL = "https://api.test";
  process.env.STORE_URL = "https://store.test";
  const app = redirectUrlFor({ req, intent: { source: "app", type: "renewal", orderId: "R1" }, settled: { outcome: "success" } });
  assert.equal(app, "https://api.test/api/ccavenue/app-result?status=success&type=renewal&orderId=R1");
  const webOk = redirectUrlFor({ req, intent: { source: "web", type: "subscription", orderId: "L1" }, settled: { outcome: "success" } });
  assert.equal(webOk, "https://store.test/user/menuCalendarPage?payment=success&type=subscription&orderId=L1");
  const webFail = redirectUrlFor({ req, intent: { source: "legacy", type: "renewal", orderId: "R2" }, settled: { outcome: "failed", status: "failed" } });
  assert.equal(webFail, "https://store.test/payment/subscriptionFailed?type=renewal&orderId=R2&reason=failed");
  const hol = redirectUrlFor({ req, intent: { source: "web", type: "holiday", orderId: "H1" }, settled: { outcome: "failed", status: "amount_mismatch" } });
  assert.equal(hol, "https://store.test/payment/failed?type=holiday&orderId=H1&reason=amount_mismatch");
});
