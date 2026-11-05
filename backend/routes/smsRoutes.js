const express = require("express");
const router = express.Router();
const isAdminUser = require("../middleware/isAdminUser");

const {
  sendSMSNotification,
  sendOTPSMS,
  sendSignupConfirmationSMS,
  sendPaymentConfirmationSMS,
  sendTrialFoodConfirmationSMS,
  sendTrialFoodFeedbackSMS,
  getSMSLogs
} = require("../controller/smsController");
const { isAuth, isAdmin } = require("../config/auth");

// Send generic SMS notification
router.post("/send", isAuth, isAdminUser, sendSMSNotification);

// Send OTP SMS
router.post("/send-otp", isAuth, isAdminUser, sendOTPSMS);

// Send signup confirmation SMS
router.post("/send-signup-confirmation", isAuth, isAdminUser, sendSignupConfirmationSMS);

// Send payment confirmation SMS
router.post("/send-payment-confirmation", isAuth, isAdminUser, sendPaymentConfirmationSMS);

// Send trial food confirmation SMS
router.post("/send-trial-food-confirmation", isAuth, isAdminUser, sendTrialFoodConfirmationSMS);

// Send trial food feedback SMS
router.post("/send-trial-food-feedback", isAuth, isAdminUser, sendTrialFoodFeedbackSMS);

// Get SMS logs (protected route)
router.get("/logs", isAuth, getSMSLogs);

// Admin route to get all SMS logs
router.get("/admin/logs", isAuth, isAdminUser, getSMSLogs);

module.exports = router;