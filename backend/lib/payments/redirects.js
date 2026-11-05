/**
 * Where to send the customer's browser after CCAvenue posts a payment result.
 *  - app checkouts land on the API's /app-result page, which the app intercepts;
 *  - website checkouts land on the website (STORE_URL), with the order id, type and
 *    outcome in the query string so the result pages can show them and offer the
 *    right retry.
 */
const { getApiPublicUrl } = require("../ccavenue");

const storeUrl = () => (process.env.STORE_URL || "https://lunchbowl.co.in").replace(/\/+$/, "");

const q = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

function redirectUrlFor({ req, intent, settled, type, orderId }) {
  const kind = (intent && intent.type) || type || "subscription";
  const id = (intent && intent.orderId) || orderId || "";
  const ok = settled && settled.outcome === "success";
  const reason = ok ? undefined : (settled && settled.status) || "failed";

  if (intent && intent.source === "app") {
    return `${getApiPublicUrl(req)}/api/ccavenue/app-result?${q({ status: ok ? "success" : "failed", type: kind, orderId: id, reason })}`;
  }

  const base = storeUrl();
  if (ok) {
    if (kind === "holiday") return `${base}/payment/success?${q({ type: kind, orderId: id })}`;
    return `${base}/user/menuCalendarPage?${q({ payment: "success", type: kind, orderId: id })}`;
  }
  if (kind === "holiday") return `${base}/payment/failed?${q({ type: kind, orderId: id, reason })}`;
  return `${base}/payment/subscriptionFailed?${q({ type: kind, orderId: id, reason })}`;
}

module.exports = { redirectUrlFor, storeUrl };
