const mongoose = require("mongoose");

/** Website enquiry forms (contact us, get in touch, nutrition, school service, trial). */
const EnquirySchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: ["contact-us", "get-in-touch", "talk-nutrition", "school-service", "free-trial"],
    },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    school: { type: String, default: "" },
    message: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
    note: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);

EnquirySchema.index({ kind: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.Enquiry || mongoose.model("Enquiry", EnquirySchema);
