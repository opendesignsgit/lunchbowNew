const express = require("express");
const router = express.Router();
const { ccavenueResponse, holiydayPayment, getHolidayPaymentsByDate } = require("../controller/Payment");

router.post("/response", ccavenueResponse);

router.post("/response/holiydayPayment", holiydayPayment);


// New endpoint — POST with body { date, userId }
router.post("/holiday-payments", getHolidayPaymentsByDate);

module.exports = router;
