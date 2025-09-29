const mongoose = require("mongoose");

const FormSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer", // Referencing the Customer schema
    required: true,
  },
  step: {
    type: Number,
    default: 1, // Start at step 1 by default
  },
  parentDetails: {
    fatherFirstName: { type: String, required: true },
    fatherLastName: { type: String, required: true },
    motherFirstName: { type: String, required: true },
    motherLastName: { type: String, required: true },
    mobile: {
      type: String,
      required: true,
      match: /^[0-9]{10}$/,
    },
    email: {
      type: String,
      required: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    address: { type: String, required: true },
    // New fields added below
    pincode: {
      type: String,
      required: true,
      match: /^[0-9]{6}$/, // Validates 6-digit pincode
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
      default: "India", // Default value set to India
    },
  },
  children: [
    {
      childFirstName: { type: String, required: true },
      childLastName: { type: String, required: true },
      dob: { type: Date, required: true },
      lunchTime: { type: String, required: true },
      school: { type: String, required: true },
      location: { type: String, required: true },
      childClass: { type: String, required: true },
      section: { type: String, required: true },
      allergies: { type: String, default: "" },
    },
  ],
  subscriptionPlan: {
    planId: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    workingDays: { type: Number, required: true },
    price: { type: Number, required: true },
    orderId: { type: String }, // Added for CCAvenue order tracking
    paymentAmount: { type: Number }, // Actual amount paid
    paymentDate: { type: Date }, // When payment was made
    paymentMethod: { type: String, default: "CCAvenue" },
    transactionId: { type: String },
  },
  paymentStatus: { type: String, required: true },

  subscriptionCount: {
    type: Number,
    default: 0, // Start with 0 subscriptions
    required: true,
  },
});

module.exports = mongoose.model("Form", FormSchema);
