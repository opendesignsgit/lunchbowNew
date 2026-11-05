const express = require('express');
const router = express.Router();
const { isAuth } = require("../config/auth");
const isAdminUser = require("../middleware/isAdminUser");
const admin = [isAuth, isAdminUser];


const {
  addAttribute,
  addAllAttributes,
  getAllAttributes,
  getShowingAttributes,
  getAttributeById,
  updateAttributes,
  updateStatus,
  deleteAttribute,
  getShowingAttributesTest,
  updateChildStatus,
  deleteChildAttribute,
  addChildAttributes,
  updateChildAttributes,
  getChildAttributeById,
  updateManyAttribute,
  deleteManyAttribute,
  updateManyChildAttribute,
  deleteManyChildAttribute,
} = require('../controller/attributeController');

//add attribute
router.post('/add', admin, addAttribute);

//add all attributes
router.post('/add/all', admin, addAllAttributes);

// add child attribute
router.put('/add/child/:id', admin, addChildAttributes);

//get all attribute
router.get('/', getAllAttributes);

// router.get('/show', getShowingProducts);
router.get('/show', getShowingAttributes);

router.put('/show/test', admin, getShowingAttributesTest);

// update many attributes
router.patch('/update/many', admin, updateManyAttribute);

//get attribute by id
router.get('/:id', getAttributeById);

// child get attributes by id
router.get('/child/:id/:ids', getChildAttributeById);

//update attribute
router.put('/:id', admin, updateAttributes);

// update child attribute
router.patch('/update/child/many', admin, updateManyChildAttribute);

// update child attribute
router.put('/update/child/:attributeId/:childId', admin, updateChildAttributes);

//show/hide a attribute
router.put('/status/:id', admin, updateStatus);

// show and hide a child status
router.put('/status/child/:id', admin, updateChildStatus);

//delete attribute
router.delete('/:id', admin, deleteAttribute);

// delete child attribute
router.put('/delete/child/:attributeId/:childId', admin, deleteChildAttribute);

// delete many attribute
router.patch('/delete/many', admin, deleteManyAttribute);

// delete many child attribute
router.patch('/delete/child/many', admin, deleteManyChildAttribute);

module.exports = router;
