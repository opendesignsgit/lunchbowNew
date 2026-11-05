const express = require("express");
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];

const {
  addHoliday,
  getAllHolidays,
  updateHoliday,
  deleteHoliday
} = require("../controller/adminController");

// Add a holiday
router.post("/add-holiday", admin, addHoliday);

// Get all holidays
router.get("/get-all-holidays", getAllHolidays);

// Update a holiday
router.put("/update-holiday/:id", admin, updateHoliday);

// Delete a holiday
router.delete("/delete-holiday/:id", admin, deleteHoliday);

module.exports = router;