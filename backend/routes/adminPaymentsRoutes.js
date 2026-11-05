const express = require("express");
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const c = require("../controller/adminPaymentsController");

// Mounted at /api/admin-ops/payments — admin login required for everything here.
router.use(isAuth, isAdminUser);

router.get("/", c.listPayments);
router.get("/summary", c.paymentsSummary);
router.post("/run-reconciliation", c.runReconciliationNow);
router.get("/customer/:userId", c.customerPayments);
router.get("/:orderId", c.getPayment);
router.post("/:orderId/reconcile", c.reconcilePayment);
router.post("/:orderId/confirm", c.confirmPayment);
router.post("/:orderId/retry-apply", c.retryApplyPayment);

module.exports = router;
