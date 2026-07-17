const mongoose = require("mongoose");

/**
 * Singleton settings document holding admin-controlled PRICING and MAIL config.
 * Read it anywhere via:  const s = await AppSettings.getSettings();
 *
 * Defaults below mirror the values that were previously hardcoded, so seeding
 * an empty database reproduces today's behaviour exactly.
 */

// One subscription plan tier (e.g. 22 working days) and its discounts.
// discountSingle = 1 child, discountMulti = childCount >= multiChildThreshold.
const planTierSchema = new mongoose.Schema(
  {
    days: { type: Number, required: true, min: 1 },
    discountSingle: { type: Number, default: 0, min: 0, max: 1 },
    discountMulti: { type: Number, default: 0, min: 0, max: 1 },
  },
  { _id: false }
);

// One transactional mail type: who receives it, its subject, and a kill switch.
const mailEventSchema = new mongoose.Schema(
  {
    recipients: { type: [String], default: [] }, // "To" — empty = customer-only mail
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const appSettingsSchema = new mongoose.Schema(
  {
    // singleton guard — there is only ever one document
    key: { type: String, default: "app", unique: true, index: true },

    pricing: {
      basePricePerDay: { type: Number, default: 225, min: 0 },
      holidayMealPrice: { type: Number, default: 225, min: 0 },
      addChildPricePerDay: { type: Number, default: 225, min: 0 },
      adhocMealPrice: { type: Number, default: 250, min: 0 },
      walletCreditOnMealDelete: { type: Number, default: 225, min: 0 }, // 250 in pro
      walletRedeemCapPercent: { type: Number, default: 80, min: 0, max: 100 },
      multiChildThreshold: { type: Number, default: 2, min: 1 },
      planTiers: {
        type: [planTierSchema],
        default: () => [
          { days: 22, discountSingle: 0, discountMulti: 0.05 },
          { days: 66, discountSingle: 0.05, discountMulti: 0.15 },
          { days: 132, discountSingle: 0.1, discountMulti: 0.2 },
        ],
      },
    },

    mail: {
      fromName: { type: String, default: "Lunch Bowl" },
      companyEmail: { type: String, default: "contactus@lunchbowl.co.in" },
      events: {
        nutrition: {
          type: mailEventSchema,
          default: () => ({
            recipients: [
              "contactus@lunchbowl.co.in",
              "maniyarasanodi20@gmail.com",
              "yourpersonalrd.sujatha@gmail.com",
              "sujatha@nutritureclinic.com",
            ],
            subject: "New Nutrition Enquiry Received",
          }),
        },
        trialMeal: {
          type: mailEventSchema,
          default: () => ({
            recipients: ["contactus@lunchbowl.co.in", "maniyarasanodi20@gmail.com"],
            subject: "New Trail Meal @ 99 Enquiry",
          }),
        },
        general: {
          type: mailEventSchema,
          default: () => ({
            recipients: ["contactus@lunchbowl.co.in", "maniyarasanodi20@gmail.com"],
            subject: "New General Enquiry Received",
          }),
        },
        contact: {
          type: mailEventSchema,
          default: () => ({
            recipients: ["contactus@lunchbowl.co.in", "maniyarasanodi20@gmail.com"],
            subject: "New Contact Us Enquiry",
          }),
        },
        school: {
          type: mailEventSchema,
          default: () => ({
            recipients: ["contactus@lunchbowl.co.in", "maniyarasanodi20@gmail.com"],
            subject: "New School Service Enquiry Received",
          }),
        },
        mealDelete: {
          type: mailEventSchema,
          default: () => ({
            recipients: [
              "contactus@lunchbowl.co.in",
              "csivarex.odi@gmail.com",
              "maniyarasanodi20@gmail.com",
            ],
            subject: "Meal Deleted by Customer",
          }),
        },
        subscription: {
          type: mailEventSchema,
          default: () => ({
            recipients: ["contactus@lunchbowl.co.in"],
            subject: "Subscription Payment",
          }),
        },
        tryOurMeal: {
          type: mailEventSchema,
          default: () => ({
            recipients: [
              "contactus@lunchbowl.co.in",
              "csivarex.odi@gmail.com",
              "maniyarasanodi20@gmail.com",
            ],
            subject: "New Try Our Meal Order",
          }),
        },
      },
    },

    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

/**
 * Returns the singleton settings doc, creating it with defaults on first call.
 * Safe to call on every request (single indexed lookup).
 */
appSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: "app" });
  if (!doc) doc = await this.create({ key: "app" });
  return doc;
};

const AppSettings = mongoose.model("AppSettings", appSettingsSchema);
module.exports = AppSettings;
