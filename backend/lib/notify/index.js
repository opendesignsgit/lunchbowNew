/**
 * Admin notification bus — every user action the team should know about goes
 * through notifyAdmin(). Channels (in-dashboard, email, push) are implemented in
 * the sibling modules; this entry point never throws, so a notification failure
 * can never break the user's request.
 *
 *   await notifyAdmin({
 *     type: "payment.success",          // see events.js catalogue
 *     severity: "info" | "warning" | "critical",
 *     title: "Renewal paid",
 *     message: "Priya R renewed 22 days for ₹4,950",
 *     userId,                           // customer, optional
 *     meta: { orderId, amount },        // anything useful for the admin UI
 *   });
 */
let impl = null;
try {
  // eslint-disable-next-line global-require
  impl = require("./adminNotify");
} catch (err) {
  impl = null;
}

const notifyAdmin = async (event) => {
  try {
    if (impl && typeof impl.notifyAdmin === "function") {
      return await impl.notifyAdmin(event);
    }
    console.log("[notifyAdmin]", event && event.type, event && event.title);
    return null;
  } catch (err) {
    console.error("[notifyAdmin] failed:", err && err.message);
    return null;
  }
};

module.exports = { notifyAdmin };
