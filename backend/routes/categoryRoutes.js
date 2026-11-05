const express = require('express');
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];

const {
  addCategory,
  addAllCategory,
  getAllCategory,
  getAllCategories,
  getShowingCategory,
  getCategoryById,
  updateCategory,
  updateStatus,
  deleteCategory,
  deleteManyCategory,
  updateManyCategory

} = require('../controller/categoryController');

//add a category
router.post('/add', admin, addCategory);

//add all category
router.post('/add/all', admin, addAllCategory);

//get only showing category
router.get('/show', getShowingCategory);

//get all category
router.get('/', getAllCategory);
//get all category
router.get('/all', getAllCategories);

//get a category
router.get('/:id', getCategoryById);

//update a category
router.put('/:id', admin, updateCategory);

//show/hide a category
router.put('/status/:id', admin, updateStatus);

//delete a category
router.delete('/:id', admin, deleteCategory);

// delete many category
router.patch('/delete/many', admin, deleteManyCategory);

// update many category
router.patch('/update/many', admin, updateManyCategory);

module.exports = router;
