const router = require("express").Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];

const {
  addGlobalSetting,
  getGlobalSetting,
  updateGlobalSetting,
  addStoreSetting,
  getStoreSetting,
  updateStoreSetting,
  getStoreSeoSetting,
  addStoreCustomizationSetting,
  getStoreCustomizationSetting,
  updateStoreCustomizationSetting,
} = require("../controller/settingController");

//add a global setting
router.post("/global/add", admin, addGlobalSetting);

//get global setting
router.get("/global/all", getGlobalSetting);

//update global setting
router.put("/global/update", admin, updateGlobalSetting);

//add a store setting
router.post("/store-setting/add", admin, addStoreSetting);

//get store setting
router.get("/store-setting/all", getStoreSetting);

//get store setting
router.get("/store-setting/seo", getStoreSeoSetting);

//update store setting
router.put("/store-setting/update", admin, updateStoreSetting);

//store customization routes

//add a online store customization setting
router.post("/store/customization/add", admin, addStoreCustomizationSetting);

//get online store customization setting
router.get("/store/customization/all", getStoreCustomizationSetting);

//update online store customization setting
router.put("/store/customization/update", admin, updateStoreCustomizationSetting);

module.exports = router;
