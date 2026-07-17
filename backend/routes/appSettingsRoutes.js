const express = require("express");
const router = express.Router();
const { isAuth } = require("../config/auth");
const {
  getPublicSettings,
  getSettings,
  updateSettings,
} = require("../controller/appSettingsController");

// Public — store frontend reads pricing only (no auth, no mail config exposed)
router.get("/public", getPublicSettings);

// Admin — full settings read/write.
// NOTE: deliberately isAuth only, matching the rest of this app. `isAdmin` is not
// used here because it doesn't inspect the caller at all — it only checks whether
// ANY document with role "Admin" exists, so it 401s everyone when admins have a
// different role string, while granting nothing when one does. See config/auth.js.
// If real role-based control is needed, fix isAdmin to check req.user first.
router.get("/", isAuth, getSettings);
router.put("/", isAuth, updateSettings);

module.exports = router;
