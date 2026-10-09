/**
 * Test-only payment endpoints mark orders as paid without going through CCAvenue,
 * so they must never be reachable on the live API. Enabled only when
 * ALLOW_LOCAL_PAYMENTS=true or CCAV_MODE=test (set these on dev/local only).
 */
module.exports = (req, res, next) => {
  if (process.env.ALLOW_LOCAL_PAYMENTS === "true" || process.env.CCAV_MODE === "test") return next();
  return res.status(404).json({ success: false, message: "Not found" });
};
