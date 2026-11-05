/**
 * Push alerts to admin devices via Firebase Cloud Messaging.
 *
 * firebase-admin is optional: it is required lazily and only when
 * FIREBASE_SERVICE_ACCOUNT_JSON (stringified service-account JSON) or
 * GOOGLE_APPLICATION_CREDENTIALS (path) is configured. Otherwise every call is a
 * no-op (logged once). Never throws.
 */
const AdminDevice = require("../../models/AdminDevice");

let messaging = null;
let initTried = false;
let warned = false;

const PRUNE_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const getMessaging = () => {
  if (messaging || initTried) return messaging;
  initTried = true;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!json && !credPath) {
    if (!warned) {
      console.log("[notify/push] Firebase not configured — admin push disabled");
      warned = true;
    }
    return null;
  }
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      const credential = json
        ? admin.credential.cert(JSON.parse(json))
        : admin.credential.applicationDefault();
      admin.initializeApp({ credential });
    }
    messaging = admin.messaging();
  } catch (err) {
    console.error("[notify/push] firebase-admin unavailable:", err && err.message);
    messaging = null;
  }
  return messaging;
};

const isConfigured = () => Boolean(getMessaging());

const stringifyData = (data) =>
  Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
  );

/** Sends to every registered admin device. Resolves to the number of successful deliveries. */
const sendToAdmins = async ({ title, body, data }) => {
  const fcm = getMessaging();
  if (!fcm) return 0;
  try {
    const devices = await AdminDevice.find({}).select("token").lean();
    const tokens = devices.map((d) => d.token).filter(Boolean);
    if (tokens.length === 0) return 0;
    let sent = 0;
    const invalid = [];
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await fcm.sendEachForMulticast({
        tokens: chunk,
        notification: { title: String(title || "LunchBowl"), body: String(body || "") },
        data: stringifyData(data),
      });
      sent += res.successCount || 0;
      (res.responses || []).forEach((r, idx) => {
        const code = r && r.error && r.error.code;
        if (!r.success && code && PRUNE_CODES.has(code)) invalid.push(chunk[idx]);
      });
    }
    if (invalid.length) {
      await AdminDevice.deleteMany({ token: { $in: invalid } });
      console.log(`[notify/push] pruned ${invalid.length} invalid device token(s)`);
    }
    return sent;
  } catch (err) {
    console.error("[notify/push] send failed:", err && err.message);
    return 0;
  }
};

/** Test hook: inject a fake messaging client. */
const _setMessaging = (m) => {
  messaging = m;
  initTried = true;
};

module.exports = { sendToAdmins, isConfigured, _setMessaging, PRUNE_CODES };
