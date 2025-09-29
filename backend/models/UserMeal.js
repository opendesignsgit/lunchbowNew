const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
  mealDate: {
    type: Date,
    required: true
  },
  mealName: {
    type: String,
    required: true
  }
});

const childMealEntrySchema = new mongoose.Schema({
  childId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Child', // Replace with your actual Child model name
    required: true
  },
  meals: {
    type: [mealSchema],
    default: []
  }
});

const userMealSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  children: {
    type: [childMealEntrySchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserMeal', userMealSchema);
