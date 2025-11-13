const mongoose = require('mongoose');

const deletedMealSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  // ✅ NEW: Track which plan the deleted meal belongs to
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  planId: {
    type: String,
    required: true
  },
  deletedMenus: [
    {
      childId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Child',
        required: true 
      },
      date: { 
        type: String, 
        required: true // YYYY-MM-DD format
      },
      childName: { 
        type: String
      },
      mealName: {
        type: String
      }
    }
  ],
  totalWalletPointsEarned: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const DeletedMeal = mongoose.model('DeletedMeal', deletedMealSchema);
module.exports = DeletedMeal;
