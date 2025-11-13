const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  transactionType: {
    type: String,
    enum: ['credited', 'redeemed', 'expired'],
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  reason: {
    type: String // 'meal_deleted', 'redemption', etc.
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'expired'],
    default: 'active'
  },
  expiryDate: {
    type: Date // Points might expire after 6 months, etc.
  }
}, { timestamps: true });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports = WalletTransaction;
