/**
 * CCAvenue Order Status API client.
 *
 * Used by the reconciliation job and the admin "check with CCAvenue" action to find
 * out what happened to an order when the gateway's browser redirect never reached us
 * (typical for UPI: the parent switches to the UPI app and never returns).
 *
 * Requires the status API to be enabled on the merchant account. Configure:
 *   CCAV_STATUS_API_ENABLED=true
 *   CCAV_STATUS_API_URL=https://api.ccavenue.com/apis/servlet/DoWebTrans   (test: https://apitest.ccavenue.com/apis/servlet/DoWebTrans)
 *   CCAV_ACCESS_CODE / CCAV_WORKING_KEY (the integration credentials; a separate
 *   access code can be given with CCAV_STATUS_ACCESS_CODE)
 *
 * The request/response format follows CCAvenue's "orderStatusTracker" command
 * (version 1.2, JSON). Verify once against the merchant's test credentials: the field
 * names come from CCAvenue's API documentation, not from a live call in this repo.
 */
const axios = require("axios");
const qs = require("querystring");
const ccav = require("../utils/ccavutil");
const { getCcavConfig } = require("./ccavenue");

const isEnabled = () => process.env.CCAV_STATUS_API_ENABLED === "true";

const statusApiUrl = () =>
  process.env.CCAV_STATUS_API_URL || "https://api.ccavenue.com/apis/servlet/DoWebTrans";

/**
 * Maps CCAvenue's order_status wording to our settlement statuses.
 *  Success  → money captured
 *  Failure / Aborted / Invalid / Timeout → final, not paid
 *  Pending  → not final yet (Initiated / Awaited / unknown)
 */
const mapGatewayStatus = (raw) => {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "Pending";
  if (["success", "successful", "shipped", "captured", "settled"].includes(s)) return "Success";
  if (["unsuccessful", "failure", "failed", "declined"].includes(s)) return "Failure";
  if (["aborted", "cancelled", "canceled"].includes(s)) return "Aborted";
  if (["invalid", "fraud", "refunded", "chargeback"].includes(s)) return "Invalid";
  if (["timeout", "timed out"].includes(s)) return "Timeout";
  if (["initiated", "awaited", "pending", "in process", "processing"].includes(s)) return "Pending";
  return "Pending";
};

/** Parses "status=0&enc_response=..." style replies. */
const parseEnvelope = (body) => {
  if (body && typeof body === "object") return body;
  return qs.parse(String(body || ""));
};

/**
 * Returns { ok, orderStatus, trackingId, amount, raw } or { ok:false, error }.
 * Never throws.
 */
async function fetchOrderStatus(orderId, { referenceNo } = {}) {
  if (!isEnabled()) return { ok: false, error: "status_api_disabled" };
  const cfg = getCcavConfig();
  const accessCode = process.env.CCAV_STATUS_ACCESS_CODE || cfg.accessCode;
  try {
    const payload = JSON.stringify(
      referenceNo ? { order_no: orderId, reference_no: referenceNo } : { order_no: orderId }
    );
    const encRequest = ccav.encrypt(payload, cfg.workingKey);
    const form = qs.stringify({
      enc_request: encRequest,
      access_code: accessCode,
      command: "orderStatusTracker",
      request_type: "JSON",
      response_type: "JSON",
      version: "1.2",
    });
    const res = await axios.post(statusApiUrl(), form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
      responseType: "text",
      transformResponse: [(d) => d],
    });
    const env = parseEnvelope(res.data);
    if (String(env.status) !== "0") {
      return { ok: false, error: `gateway_status_${env.status}`, raw: env };
    }
    let decoded;
    try {
      decoded = JSON.parse(ccav.decrypt(String(env.enc_response || "").trim(), cfg.workingKey));
    } catch (err) {
      return { ok: false, error: "decrypt_failed", raw: env };
    }
    if (decoded.error_code || decoded.error_desc) {
      return { ok: false, error: decoded.error_desc || decoded.error_code, raw: decoded };
    }
    return {
      ok: true,
      orderStatus: mapGatewayStatus(decoded.order_status),
      gatewayStatus: decoded.order_status,
      trackingId: decoded.reference_no || decoded.order_bank_ref_no || null,
      amount: decoded.order_amt != null ? Number(decoded.order_amt) : null,
      paymentMode: decoded.order_card_name || decoded.order_option_type || null,
      raw: decoded,
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "request_failed" };
  }
}

module.exports = { isEnabled, mapGatewayStatus, fetchOrderStatus, parseEnvelope };
