const express = require("express");
const router = express.Router();
const { isAuth, isAdmin } = require("../config/auth");
const {
  getPublicSettings,
  getSettings,
  updateSettings,
} = require("../controller/appSettingsController");

// Public — store frontend reads pricing only (no auth, no mail config exposed)
router.get("/public", getPublicSettings);

// Admin — full settings read/write
router.get("/", isAuth, isAdmin, getSettings);
router.put("/", isAuth, isAdmin, updateSettings);

module.exports = router;
