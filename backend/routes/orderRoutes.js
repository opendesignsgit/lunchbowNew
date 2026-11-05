const express = require("express");
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];

const {
  getAllOrders,
  getOrderById,
  getOrderCustomer,
  updateOrder,
  deleteOrder,
  getDashboardOrders,
  getDashboardRecentOrder,
  getBestSellerProductChart,
  getDashboardCount,
  getDashboardAmount,
  getAllFoodOrders,
  getKitchenSheet,
  searchOrders,
  userSubscription,
  searchUserSubscriptions,
} = require("../controller/orderController");

// Add search route here
router.get("/search", admin, searchOrders);

// Grouped dispatch sheet (school → lunch slot) with CSV export. Keep above "/:id".
router.get("/kitchen-sheet", admin, getKitchenSheet);

//get all orders
router.get("/", admin, getAllOrders);

// get dashboard orders data
router.get("/dashboard", admin, getDashboardOrders);

// dashboard recent-order
router.get("/dashboard-recent-order", admin, getDashboardRecentOrder);

// dashboard order count
router.get("/dashboard-count", admin, getDashboardCount);

// dashboard order amount
router.get("/dashboard-amount", admin, getDashboardAmount);

// chart data for product
router.get("/best-seller/chart", admin, getBestSellerProductChart);

//get all order by a user
router.get("/customer/:id", admin, getOrderCustomer);

//get a order by id
router.get("/:id", admin, getOrderById);

//update a order
router.put("/:id", admin, updateOrder);

//delete a order
router.delete("/:id", admin, deleteOrder);

router.get("/get-all/food-order", admin, getAllFoodOrders);

router.get("/get-All/user-Subscription", admin, userSubscription);

// Search orders with filters
router.get("/get-All/user-Subscription/search", admin, searchUserSubscriptions);

module.exports = router;
