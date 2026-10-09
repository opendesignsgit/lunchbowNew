/**
 * Server-side CCAvenue helpers.
 *
 * The working key must only ever live on the server. Configure it with
 * CCAV_WORKING_KEY / CCAV_ACCESS_CODE / CCAV_MERCHANT_ID; the defaults are the
 * values the website already ships with and should be rotated (see README).
 */
const ccav = require("../utils/ccavutil");

const getCcavConfig = () => ({
  merchantId: process.env.CCAV_MERCHANT_ID || "4381442",
  accessCode: process.env.CCAV_ACCESS_CODE || "AVRM80MF59BY86MRYB",
  workingKey: process.env.CCAV_WORKING_KEY || "2A561B005709D8B4BAF69D049B23546B",
  gatewayUrl:
    process.env.CCAV_GATEWAY_URL ||
    "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
});

/** Public base URL of this API (used for CCAvenue redirect URLs and the app result page). */
const getApiPublicUrl = (req) => {
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/+$/, "");
  const proto = (req && req.get && req.get("x-forwarded-proto")) || (req && req.protocol) || "https";
  const host = req && req.get && req.get("host");
  return host ? `${proto.split(",")[0]}://${host}` : "https://api.lunchbowl.co.in";
};

/** True when the gateway should be charged ₹1 instead of the real amount (dev/test only). */
const isTestAmountMode = () => process.env.CCAV_TEST_AMOUNT_RE1 === "true";

/** Builds and encrypts the CCAvenue request. `fields` are CCAvenue parameter names. */
const buildEncryptedRequest = (fields) => {
  const { workingKey } = getCcavConfig();
  const plainText = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return ccav.encrypt(plainText, workingKey);
};

const billingFields = (customer, parentDetails) => ({
  billing_name: String(customer?.name || "Customer").substring(0, 50),
  billing_email: String(parentDetails?.email || customer?.email || "no-email@example.com").substring(0, 50),
  billing_tel: String(parentDetails?.mobile || customer?.phone || "0000000000").substring(0, 20),
  billing_address: String(parentDetails?.address || "Not Provided").substring(0, 100),
  billing_city: String(parentDetails?.city || "Chennai").substring(0, 50),
  billing_state: String(parentDetails?.state || "Tamil Nadu").substring(0, 50),
  billing_zip: String(parentDetails?.pincode || "600001").substring(0, 10),
  billing_country: String(parentDetails?.country || "India").substring(0, 50),
});

module.exports = {
  getCcavConfig,
  getApiPublicUrl,
  isTestAmountMode,
  buildEncryptedRequest,
  billingFields,
};
