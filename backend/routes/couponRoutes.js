const express = require('express');
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];

const {
  addCoupon,
  addAllCoupon,
  getAllCoupons,
  getShowingCoupons,
  getCouponById,
  updateCoupon,
  updateStatus,
  deleteCoupon,
  updateManyCoupons,
  deleteManyCoupons,
} = require('../controller/couponController');

//add a coupon
router.post('/add', admin, addCoupon);

//add multiple coupon
router.post('/add/all', admin, addAllCoupon);

//get all coupon
router.get('/', getAllCoupons);

//get only enable coupon
router.get('/show', getShowingCoupons);

//get a coupon
router.get('/:id', getCouponById);

//update a coupon
router.put('/:id', admin, updateCoupon);

//update many coupon
router.patch('/update/many', admin, updateManyCoupons);

//show/hide a coupon
router.put('/status/:id', admin, updateStatus);

//delete a coupon
router.delete('/:id', admin, deleteCoupon);

//delete many coupon
router.patch('/delete/many', admin, deleteManyCoupons);

module.exports = router;
