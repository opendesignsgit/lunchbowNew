const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { isAuth } = require("../config/auth");
const localPaymentsOnly = require("../middleware/localPaymentsOnly");
const isAdminUser = require("../middleware/isAdminUser");
const requireOwner = require("../middleware/requireOwner");
// Customer data: the caller must be logged in and may only touch their own records.
const own = [isAuth, requireOwner];
const {
  loginCustomer,
  registerCustomer,
  verifyPhoneNumber,
  signUpWithProvider,
  signUpWithOauthProvider,
  verifyEmailAddress,
  forgetPassword,
  changePassword,
  resetPassword,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  deleteAccount,
  addAllCustomers,
  addShippingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  sendOtp,
  verifyOtp,
  stepFormRegister,
  getMenuCalendarDate,
  saveMealPlans,
  getSavedMeals,
  stepCheck,
  accountDetails,
  verifyCCAvenuePayment,
  handleCCAvenueResponse,
  getFormData, // Add this new controller method
  getPaidHolidays,
  getAllChildrenForUser,
  getPaymentsForUser,
  deleteMeal,
} = require("../controller/customerController");
const {
  passwordVerificationLimit,
  emailVerificationLimit,
  phoneVerificationLimit,
} = require("../lib/email-sender/sender");

// Import CCAvenue routes
const ccavenueRoutes = require("./ccavenue");
// Test-only settlement shares the real settlement code (controller/Payment.js)
const { localPaymentSuccess, localAddChildPaymentController } = require("../controller/Payment");
router.use("/ccavenue", ccavenueRoutes);

// Rate limiter for sensitive destructive operations (max 5 attempts per 15 min per IP)
const deleteAccountLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, message: 'Too many delete-account requests. Please try again later.' },
});

// Rate limiter for holiday payment queries (max 300 requests per 15 min per IP;
// kept generous because many parents share carrier NAT IPs and the web calendar calls this too)
const paidHolidaysLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

//verify email
router.post("/verify-email", emailVerificationLimit, verifyEmailAddress);

//verify phone number
router.post("/verify-phone", phoneVerificationLimit, verifyPhoneNumber);

// shipping address send to array
router.post("/shipping/address/:id", own, addShippingAddress);

// get all shipping address
router.get("/shipping/address/:id", own, getShippingAddress);

// shipping address update
router.put("/shipping/address/:userId/:shippingId", own, updateShippingAddress);

// shipping address delete
router.delete("/shipping/address/:userId/:shippingId", own, deleteShippingAddress);

//register a user
router.post("/register/:token", registerCustomer);

//login a user
router.post("/login", loginCustomer);

//register or login with google and fb
router.post("/signup/oauth", signUpWithOauthProvider);

//register or login with google and fb
router.post("/signup/:token", signUpWithProvider);

//forget-password
router.put("/forget-password", passwordVerificationLimit, forgetPassword);

//reset-password
router.put("/reset-password", resetPassword);

//change password
router.post("/change-password", isAuth, changePassword);

//add all users
router.post("/add/all", isAuth, isAdminUser, addAllCustomers);

//get all user
router.get("/", isAuth, isAdminUser, getAllCustomers);

//get a user
router.get("/:id", isAuth, isAdminUser, getCustomerById);

// Get form data by user ID
router.get("/form/:userId", own, getFormData);

//update a user
router.put("/:id", isAuth, isAdminUser.orSelf("id"), updateCustomer);

//delete a user
router.delete("/:id", isAuth, isAdminUser, deleteCustomer);

//send OTP
router.post("/sendOtp", sendOtp);

//verify Otp
router.post("/verifyOtp", verifyOtp);

//step-Form ParentDetails
router.post("/stepForm-Register", own, stepFormRegister);

router.post("/get-Menu-Calendar", own, getMenuCalendarDate);

router.post("/save-Menu-Calendar", own, saveMealPlans);

// Add to your routes
router.post("/get-saved-meals", own, getSavedMeals);

router.post("/Step-Check", own, stepCheck);

router.post("/account-details", own, accountDetails);

// CCAvenue Payment Verification
router.post("/payment/verify", own, verifyCCAvenuePayment);

// CCAvenue Response Handler
router.post("/payment/response", handleCCAvenueResponse);

router.post("/get-paid-holidays", paidHolidaysLimit, own, getPaidHolidays);

router.post("/get-all-children", own, getAllChildrenForUser);

// Test-only endpoints (no CCAvenue). Disabled on the live API; see middleware/localPaymentsOnly.js.
router.post("/local-success", localPaymentsOnly, localPaymentSuccess);

router.post("/local-success/local-add-childPayment", localPaymentsOnly, localAddChildPaymentController);

router.post("/get-payments", own, getPaymentsForUser);

router.post("/delete-meal", own, deleteMeal);

// Delete account and all associated user data
router.delete("/delete-account/:userId", deleteAccountLimit, isAuth, deleteAccount);



module.exports = router;