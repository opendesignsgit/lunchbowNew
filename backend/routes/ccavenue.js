const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { ccavenueResponse, holiydayPayment, getHolidayPaymentsByDate, addChildPaymentController, localPaymentSuccess, localAddChildPaymentController, localHolidayPaymentSuccess } = require("../controller/Payment");
const { initiatePayment, appPaymentResult } = require("../controller/paymentIntentController");
const { isAuth } = require("../config/auth");
const localPaymentsOnly = require("../middleware/localPaymentsOnly");

// Rate limiter for test/local payment endpoints (10 requests per 15 min per IP)
const localPaymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many test payment requests, please try again later." },
});

router.post("/response", ccavenueResponse);

router.post("/response/holiydayPayment", holiydayPayment);

router.post("/response/addChildPayment", addChildPaymentController);

// Server-priced, server-encrypted payment (mobile app). The client never sees the working key.
const initiateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many payment attempts, please try again later." },
});
router.post("/initiate", initiateLimiter, isAuth, initiatePayment);

// Where app payments land after CCAvenue; the app intercepts this URL.
router.get("/app-result", appPaymentResult);

// New endpoint — POST with body { date, userId }
router.post("/holiday-payments", getHolidayPaymentsByDate);

// Test-only endpoints (no CCAvenue). Disabled on the live API; see middleware/localPaymentsOnly.js.
router.post("/local-success", localPaymentsOnly, localPaymentLimiter, localPaymentSuccess);

router.post("/local-success/local-add-childPayment", localPaymentsOnly, localPaymentLimiter, localAddChildPaymentController);

// Test/local holiday payment (no CCAvenue gateway)
router.post("/local-holiday-success", localPaymentsOnly, localPaymentLimiter, localHolidayPaymentSuccess);

module.exports = router;
