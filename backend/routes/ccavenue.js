const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { ccavenueResponse, holiydayPayment, getHolidayPaymentsByDate, addChildPaymentController, localPaymentSuccess, localAddChildPaymentController, localHolidayPaymentSuccess } = require("../controller/Payment");

// Rate limiter for test/local payment endpoints (10 requests per 15 min per IP)
const localPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many test payment requests, please try again later." },
});

router.post("/response", ccavenueResponse);

router.post("/response/holiydayPayment", holiydayPayment);

router.post("/response/addChildPayment", addChildPaymentController);

// New endpoint — POST with body { date, userId }
router.post("/holiday-payments", getHolidayPaymentsByDate);

router.post("/local-success", localPaymentSuccess);

router.post("/local-success/local-add-childPayment", localAddChildPaymentController);

// Test-only endpoints mark meals as paid without going through CCAvenue, so they must
// never be reachable on the live API. Enabled only when ALLOW_LOCAL_PAYMENTS=true or CCAV_MODE=test.
const localPaymentsOnly = (req, res, next) => {
  if (process.env.ALLOW_LOCAL_PAYMENTS === "true" || process.env.CCAV_MODE === "test") return next();
  return res.status(404).json({ success: false, message: "Not found" });
};

// Test/local holiday payment (no CCAvenue gateway)
router.post("/local-holiday-success", localPaymentsOnly, localPaymentLimiter, localHolidayPaymentSuccess);

module.exports = router;
