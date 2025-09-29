const qs = require("querystring");
const ccav = require("../utils/ccavutil");
const mongoose = require("mongoose"); // Add this import for ObjectId validation
const Form = require("../models/Form");
const UserPayment = require("../models/Payment");
const nodemailer = require("nodemailer");
const { sendSMS } = require("../lib/sms-sender/smsService");
const SmsLog = require("../models/SmsLog");
const HolidayPayment = require("../models/HolidayPayment");
const UserMeal = require("../models/UserMeal");

const workingKey =
  process.env.CCAV_WORKING_KEY || "2A561B005709D8B4BAF69D049B23546B"; // Use env vars in production

// Helper function to process payment response and save payment data
async function processPaymentResponse(responseData, paymentType) {
  const {
    order_id,
    tracking_id,
    order_status,
    merchant_param1,
    merchant_param2,
    amount,
    payment_mode,
    card_name,
    status_code,
    status_message,
    bank_ref_no,
    billing_name,
    billing_email,
  } = responseData;

  if (!merchant_param1 || !order_id) {
    throw new Error(
      "Invalid payment response: missing merchant_param1 (user) or order_id"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(merchant_param1)) {
    throw new Error(`Invalid user ID (merchant_param1): ${merchant_param1}`);
  }

  // Build payment transaction object
  const paymentTransaction = {
    order_id,
    tracking_id,
    amount: parseFloat(amount || 0),
    order_status,
    payment_mode,
    card_name,
    status_code,
    status_message,
    bank_ref_no,
    billing_name,
    billing_email,
    payment_type: paymentType,
    merchant_param1,
    // Include holidayDate if holiday payment
    ...(paymentType === "holiday" && merchant_param2
      ? { holidayDate: merchant_param2 }
      : {}),
    ...responseData,
  };

  // Update or create user payment record
  const updatedPayment = await UserPayment.findOneAndUpdate(
    { user: merchant_param1 },
    {
      $push: { payments: paymentTransaction },
      $inc: { total_amount: parseFloat(amount || 0) },
      $setOnInsert: { created_at: new Date() },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );

  return { order_status, merchant_param1, order_id, tracking_id };
}

// Subscription Payment Response Handler
exports.ccavenueResponse = async (req, res) => {
  let encResponse = "";
  req.on("data", (data) => {
    encResponse += data;
  });

  req.on("end", async () => {
    try {
      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;

      if (!encrypted) {
        return res.status(400).send("Missing encrypted response");
      }

      const decrypted = ccav.decrypt(encrypted, workingKey);
      const responseData = qs.parse(decrypted);

      console.log("Subscription payment decrypted response:", responseData);

      const { order_status, merchant_param1, order_id, tracking_id } =
        await processPaymentResponse(responseData, "subscription");

      if (order_status === "Success") {
        if (!mongoose.Types.ObjectId.isValid(merchant_param1)) {
          console.error(
            "Invalid user ID in subscription payment handler:",
            merchant_param1
          );
          return res.status(400).send("Invalid user ID");
        }

        const updatedForm = await Form.findOneAndUpdate(
          { user: merchant_param1 },
          {
            $set: {
              paymentStatus: order_status,
              "subscriptionPlan.orderId": order_id,
              "subscriptionPlan.transactionId": tracking_id || "N/A",
              "subscriptionPlan.paymentDate": new Date(),
              step: 4,
            },
            $inc: {
              subscriptionCount: 1,
            },
          },
          { new: true }
        );

        console.log("Subscription payment updated form:", updatedForm);

        // Send Registration + Payment Success Mail
        if (updatedForm) {
          // Extract details for mail
          const parentName = `${updatedForm.parentDetails.fatherFirstName} ${updatedForm.parentDetails.fatherLastName}`;
          const amount = updatedForm.subscriptionPlan.price;
          const startDate = updatedForm.subscriptionPlan.startDate
            ? new Date(
              updatedForm.subscriptionPlan.startDate
            ).toLocaleDateString("en-IN")
            : "";
          const schoolName = updatedForm.children?.[0]?.school || "";
          const childName = updatedForm.children?.[0]
            ? `${updatedForm.children[0].childFirstName} ${updatedForm.children[0].childLastName}`
            : "";
          const email = updatedForm.parentDetails.email;

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Registration & Payment Successful – Welcome Aboard!",
            html: `
              <p>Hi ${parentName},</p>
              <p>Your Lunch Bowl registration is complete, and we've received your payment of ₹${amount}.</p>
              <p>🎒 Meal service starts on: ${startDate}</p>
              <p>📍 School: ${schoolName}</p>
              <p>👦 Child: ${childName}</p>
              <p>We’re thrilled to be part of your child’s lunch journey!</p>
              <p>For any help, reach out to <a href="mailto:contactus@lunchbowl.co.in">contactus@lunchbowl.co.in</a></p>
              <p>– Earth Tech Concepts Pvt Ltd</p>
            `,
          };

          transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
              console.error("Payment Success Mail Error:", err);
            }
          });

          // Send Payment Confirmation SMS
          const parentPhone = updatedForm.parentDetails.mobile;
          if (parentPhone) {
            try {
              const smsResult = await sendSMS(parentPhone, 'PAYMENT_CONFIRMATION', [amount]);

              // Log SMS
              const smsLog = new SmsLog({
                mobile: parentPhone,
                messageType: 'PAYMENT_CONFIRMATION',
                message: smsResult.message || '',
                templateId: smsResult.templateId || '',
                messageId: smsResult.messageId || '',
                status: smsResult.success ? 'sent' : 'failed',
                error: smsResult.error || undefined,
                customerId: merchant_param1,
                variables: [amount],
                sentAt: new Date()
              });

              await smsLog.save();
              console.log('Payment confirmation SMS sent to:', parentPhone);
            } catch (smsError) {
              console.error('Error sending payment confirmation SMS:', smsError);
              // Don't fail payment processing if SMS fails
            }
          }
        }

        return res.redirect("https://lunchbowl.co.in/user/menuCalendarPage");
      } else {
        return res.redirect("https://lunchbowl.co.in/payment/subscriptionFailed");
      }
    } catch (error) {
      console.error("CCAvenue subscription response error:", error);
      res.status(500).send("Internal Server Error");
    }
  });
};

// Holiday Payment Response Handler
exports.holiydayPayment = async (req, res) => {
  let encResponse = "";
  req.on("data", (data) => {
    encResponse += data;
  });

  req.on("end", async () => {
    try {
      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;
      if (!encrypted) {
        return res.status(400).send("Missing encrypted response");
      }

      let decrypted, responseData;
      try {
        decrypted = ccav.decrypt(encrypted, workingKey);
      } catch (decryptErr) {
        return res.status(400).send("Failed to decrypt payment response");
      }

      try {
        responseData = qs.parse(decrypted);
      } catch (parseErr) {
        return res.status(400).send("Malformed payment response data");
      }

      const { order_status, merchant_param1: userId, merchant_param2: mealDate, merchant_param3, tracking_id } = responseData;

      if (!userId) return res.status(400).send("Missing user ID");
      if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).send("Invalid user ID");
      if (!mealDate || !/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return res.status(400).send("Invalid mealDate (should be YYYY-MM-DD)");


      await processPaymentResponse(responseData, "holiday");

      // Parse children's paid meal data
      let childrenData = [];
      try {
        if (merchant_param3 && merchant_param3.trim().startsWith("[")) {
          childrenData = JSON.parse(merchant_param3);
        } else if (merchant_param3 && merchant_param3.includes("childId")) {
          const parts = merchant_param3.split(",");
          const childObj = {};
          for (const part of parts) {
            const clean = part.trim();
            if (clean.startsWith("childId")) childObj.childId = clean.replace("childId", "");
            if (clean.startsWith("dish")) childObj.dish = clean.replace("dish", "");
            if (clean.startsWith("mealDate")) childObj.mealDate = clean.replace("mealDate", "");
          }
          if (!childObj.mealDate && mealDate) childObj.mealDate = mealDate;
          childrenData.push(childObj);
        }
      } catch (err) {
        return res.status(400).send("Malformed childrenData in payment");
      }

      if (order_status !== "Success") {
        return res.redirect("https://lunchbowl.co.in/payment/failed");
      }

      // Always update HolidayPayment
      for (const child of childrenData) {
        const finalMealDate = child.mealDate || mealDate;
        if (child.childId && child.dish && finalMealDate) {
          try {
            await HolidayPayment.create({
              userId,
              childId: child.childId,
              mealDate: finalMealDate,
              mealName: child.dish,
              amount: 199,
              paymentStatus: "Paid",
              transactionDetails: { tracking_id, ...responseData },
            });

            try {
              const userForm = await Form.findOne({ user: userId });
              if (userForm && userForm.parentDetails) {
                const parentName = `${userForm.parentDetails.fatherFirstName} ${userForm.parentDetails.fatherLastName}`;
                const email = userForm.parentDetails.email;
                const mealDateFormatted = new Date(finalMealDate).toLocaleDateString("en-IN");
                const menuName = child.dish;

                const transporter = nodemailer.createTransport({
                  service: "gmail",
                  auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                  },
                });

                const mailOptions = {
                  from: process.env.EMAIL_USER,
                  to: email,
                  subject: "Holiday Meal Payment Confirmation – LunchBowl",
                  html: `
        <p>Hi ${parentName},</p>
        <p>Your holiday meal payment is successful.</p>
        <p>A meal has been booked for <b>${mealDateFormatted}</b> with menu <b>${menuName}</b>.</p>
        <p>We hope your child enjoys their special holiday meal!</p>
        <p>For any queries, contact <a href="mailto:contactus@lunchbowl.co.in">contactus@lunchbowl.co.in</a></p>
        <p>– Earth Tech Concepts Pvt Ltd</p>
      `,
                };

                transporter.sendMail(mailOptions, (err, info) => {
                  if (err) {
                    console.error("Holiday meal email error:", err);
                  } else {
                    console.log("Holiday meal email sent:", info.response);
                  }
                });
              }
            } catch (emailErr) {
              console.error("Error sending holiday meal email:", emailErr);
            }
          } catch (dbErr) {
            // Log, don't block
            console.error("HolidayPayment DB error:", dbErr);
          }
        }
      }

      // --- Only update existing UserMeal, DO NOT create new! ---
      let userMeal = await UserMeal.findOne({ userId: mongoose.Types.ObjectId(userId) });
      if (!userMeal) {
        return res.status(404).send("User meal plan not found. Please contact support.");
      }
      let updated = false;
      for (const child of childrenData) {
        if (!child.childId || !child.dish) continue;
        const finalMealDate = child.mealDate || mealDate;
        const mealDateObj = new Date(finalMealDate);

        // Find child's entry in userMeal
        let childObj = userMeal.children.find(
          c => c.childId.toString() === child.childId
        );
        if (!childObj) continue; // DO NOT create new child entry!

        // Check if meal for this date exists
        let mealIndex = childObj.meals.findIndex(
          m => new Date(m.mealDate).toISOString().slice(0, 10) === mealDateObj.toISOString().slice(0, 10)
        );
        if (mealIndex >= 0) {
          // Overwrite
          childObj.meals[mealIndex].mealName = child.dish;
          childObj.meals[mealIndex].mealDate = mealDateObj;
        } else {
          // Add new meal for that date
          childObj.meals.push({
            mealDate: mealDateObj,
            mealName: child.dish,
          });
        }
        updated = true;
      }

      // Save only if an update happened
      if (updated) {
        await userMeal.save();
      }

      return res.redirect("https://lunchbowl.co.in/payment/success");
    } catch (err) {
      console.error("CCAvenue holiday payment handler - Uncaught error:", err);
      res.status(500).send("Internal Server Error");
    }
  });
};



// POST Paid Holiday Data for a Specific Date and User (from request body)
exports.getHolidayPaymentsByDate = async (req, res) => {
  const { date, userId } = req.body;

  if (!date || !userId) {
    return res.status(400).json({ error: "date and userId are required in request body" });
  }

  try {
    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }
    // Validate userId is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    const payments = await HolidayPayment.find({
      mealDate: date,
      userId: userId
    }).select("-__v -createdAt -updatedAt");

    // Null/empty check
    if (!payments || payments.length === 0) {
      return res.json([]); // return empty array instead of null/error
    }

    return res.json(payments);
  } catch (err) {
    console.error("Error fetching holiday payments:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};