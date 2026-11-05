/**
 * /api/admin-ops — operations endpoints for the admin dashboard.
 * Mounted in api/index.js behind isAuth + isAdminUser. Documented in docs/admin-ops-api.md.
 */
const express = require("express");
const router = express.Router();

const settings = require("../controller/adminOps/settings");
const notifications = require("../controller/adminOps/notifications");
const audit = require("../controller/adminOps/audit");
const customers = require("../controller/adminOps/customers");
const subscriptions = require("../controller/adminOps/subscriptions");
const wallet = require("../controller/adminOps/wallet");
const meals = require("../controller/adminOps/meals");
const renewals = require("../controller/adminOps/renewals");
const requests = require("../controller/adminOps/requests");

// Business settings
router.get("/settings", settings.getSettings);
router.put("/settings", settings.updateSettings);

// Admin notifications + push devices
router.get("/notifications", notifications.listNotifications);
router.get("/notifications/unread-count", notifications.unreadCount);
router.put("/notifications/read-all", notifications.markAllRead);
router.put("/notifications/:id/read", notifications.markRead);
router.post("/devices", notifications.registerDevice);
router.delete("/devices/:token", notifications.removeDevice);

// Audit log
router.get("/audit", audit.listAudit);

// Customers
router.get("/customers", customers.searchCustomers);
router.get("/customers/:userId/overview", customers.customerOverview);

// Subscriptions
router.post("/subscriptions", subscriptions.createSubscription);
router.put("/subscriptions/:id", subscriptions.updateSubscription);

// Wallet
router.post("/wallet/:userId/adjust", wallet.adjustWallet);

// Meals
router.post("/meals/override", meals.overrideMeal);

// Renewals
router.get("/renewals", renewals.listRenewals);

// School requests, enquiries, SMS logs
router.get("/school-requests", requests.listSchoolRequests);
router.put("/school-requests/:id", requests.updateSchoolRequest);
router.get("/enquiries", requests.listEnquiries);
router.put("/enquiries/:id", requests.updateEnquiry);
router.get("/sms-logs", requests.listSmsLogs);

module.exports = router;
