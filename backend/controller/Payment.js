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
const Child = require("../models/childModel");
// const Form = require("../models/Form");
const Subscription = require("../models/subscriptionModel");

const workingKey =
  process.env.CCAV_WORKING_KEY || "2A561B005709D8B4BAF69D049B23546B"; // Use env vars in production

// Helper function to process payment response and save payment data
async function processPaymentResponse(responseData, paymentType, paidFor = null) {
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
    paidFor,
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

      const orderId = responseData.order_id || "";
      const paidFor =
        orderId.startsWith("R")
          ? "RENEW_SUBSCRIPTION"
          : orderId.startsWith("L")
            ? "SUBSCRIPTION"
            : null;

      const { order_status, merchant_param1, order_id, tracking_id } =
        await processPaymentResponse(responseData, "subscription", paidFor);

      // 🟢 Handle successful payments
      if (order_status === "Success") {
        if (!mongoose.Types.ObjectId.isValid(merchant_param1)) {
          console.error(
            "Invalid user ID in subscription payment handler:",
            merchant_param1
          );
          return res.status(400).send("Invalid user ID");
        }

        // ✅ Check if it's a renewal payment
        if (paidFor === "RENEW_SUBSCRIPTION") {
          // -------------------- RENEW LOGIC --------------------
          const form = await Form.findOne({ user: merchant_param1 })
            .populate("subscriptions")
            .exec();

          if (!form) {
            return res.status(404).send("Form not found");
          }

          // 1️⃣ Find the most recent pending payment subscription
          const pendingSub = form.subscriptions
            .filter((s) => s.status === "pending_payment")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

          if (!pendingSub) {
            console.error("No pending payment subscription found for renew");
            return res.redirect("https://lunchbowl.co.in/payment/subscriptionFailed");
          }

          // 2️⃣ Determine if the user already has an active plan
          const hasActive = form.subscriptions.some((s) => s.status === "active");
          const newStatus = hasActive ? "upcoming" : "active";

          // 3️⃣ Update that subscription
          pendingSub.status = newStatus;
          pendingSub.orderId = order_id;
          pendingSub.transactionId = tracking_id || "N/A";
          pendingSub.paymentDate = new Date();
          pendingSub.paymentMethod = "CCAvenue";
          await pendingSub.save();

          // 4️⃣ Update form summary
          form.paymentStatus = "Success";
          form.subscriptionCount = (form.subscriptionCount || 0) + 1;
          form.step = 4;
          await form.save();

          // 5️⃣ Send success email + SMS (reuse your existing logic)
          const parentName = `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`;
          const amount = pendingSub.price;
          const startDate = pendingSub.startDate
            ? new Date(pendingSub.startDate).toLocaleDateString("en-IN")
            : "";
          const schoolName = form.children?.[0]?.school || "";
          const childName = form.children?.[0]
            ? `${form.children[0].childFirstName} ${form.children[0].childLastName}`
            : "";
          const email = form.parentDetails.email;

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
            subject: "Subscription Renewal Successful – Thank You!",
            html: `
              <p>Hi ${parentName},</p>
              <p>Your Lunch Bowl subscription renewal of ₹${amount} was successful.</p>
              <p>🎒 Renewal starts on: ${startDate}</p>
              <p>📍 School: ${schoolName}</p>
              <p>👦 Child: ${childName}</p>
              <p>We’re delighted to continue serving your child’s healthy meals!</p>
              <p>– Earth Tech Concepts Pvt Ltd</p>
            `,
          };

          transporter.sendMail(mailOptions, (err) => {
            if (err) console.error("Renewal mail error:", err);
          });

          const parentPhone = form.parentDetails.mobile;
          if (parentPhone) {
            try {
              const smsResult = await sendSMS(parentPhone, "PAYMENT_CONFIRMATION", [amount]);
              await SmsLog.create({
                mobile: parentPhone,
                messageType: "PAYMENT_CONFIRMATION",
                status: smsResult.success ? "sent" : "failed",
                customerId: merchant_param1,
                variables: [amount],
                sentAt: new Date(),
              });
            } catch (err) {
              console.error("Renewal SMS send error:", err);
            }
          }

          return res.redirect("https://lunchbowl.co.in/user/menuCalendarPage");
        }

        // -------------------- ORIGINAL SUBSCRIPTION LOGIC --------------------
        else if (paidFor === "SUBSCRIPTION") {
          // keep your original code here for new subscriptions
          // (no change to that flow)
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

          // existing mail/SMS logic...
          return res.redirect("https://lunchbowl.co.in/user/menuCalendarPage");
        }
      }

      // 🟥 Payment failed case
      return res.redirect("https://lunchbowl.co.in/payment/subscriptionFailed");

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
      console.log("🟢 [HolidayPayment] Incoming encrypted CCAvenue response...");
      if (!encResponse) return res.status(400).send("Empty payment response");

      const parsed = qs.parse(encResponse);
      const encrypted = parsed.encResp;
      if (!encrypted) return res.status(400).send("Missing encrypted response");

      // 🔹 Step 1: Decrypt response
      const decrypted = ccav.decrypt(encrypted, workingKey);
      const responseData = qs.parse(decrypted);

      console.log("🧾 Decrypted Response:", responseData);

      const {
        order_status,
        merchant_param1: userId,
        merchant_param2: mealDate,
        merchant_param3,
        tracking_id,
        order_id,
      } = responseData;

      // 🔹 Step 2: Validate base fields
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error("❌ Invalid userId:", userId);
        return res.status(400).send("Invalid user ID");
      }

      if (!mealDate || !/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) {
        console.error("❌ Invalid mealDate:", mealDate);
        return res.status(400).send("Invalid mealDate (expected YYYY-MM-DD)");
      }

      // 🔹 Step 3: Parse childrenData (with planId)
      let childrenData = [];
      try {
       if (merchant_param3) {
         const decoded = Buffer.from(merchant_param3, "base64").toString("utf-8");
         childrenData = JSON.parse(decoded);
         console.log("✅ Successfully decoded & parsed childrenData:", childrenData);
       } else {
         console.warn("⚠️ No merchant_param3 provided.");
       }
     } catch (err) {
       console.error("❌ Failed to decode/parse merchant_param3:", err);
       return res.status(400).send("Malformed childrenData");
     }


      console.log("✅ Parsed Children Data:", childrenData);

      // 🔹 Step 4: Handle failed transactions
      if (order_status !== "Success") {
        console.warn("❌ Payment failed:", order_status);
        return res.redirect("https://lunchbowl.co.in/payment/failed");
      }

      // 🔹 Step 5: Save payment response
      await processPaymentResponse(responseData, "holiday", "HOLIDAY_PAY");

      // 🔹 Step 6: Process each child payment
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const mealDateObj = new Date(mealDate);

      let userMeal = await UserMeal.findOne({ userId: userObjectId });
      if (!userMeal) {
        userMeal = new UserMeal({ userId: userObjectId, plans: [] });
      }

      for (const child of childrenData) {
        const { childId, dish, planId } = child;
        if (!childId || !dish || !planId) {
          console.warn("⚠️ Skipping invalid child entry:", child);
          continue;
        }

        console.log(`👶 Processing Child: ${childId} | Plan: ${planId} | Dish: ${dish}`);

        // ✅ Step 6A: Save HolidayPayment record
        await HolidayPayment.create({
          userId,
          childId,
          mealDate: mealDateObj,
          mealName: dish,
          amount: 200,
          paymentStatus: "Paid",
          transactionDetails: { tracking_id, order_id, ...responseData },
        });

        // ✅ Step 6B: Update UserMeal
        let plan = userMeal.plans.find((p) => p.planId === planId);
        if (!plan) {
          console.log("🟠 Creating new plan entry in UserMeal:", planId);
          plan = { planId, children: [] };
          userMeal.plans.push(plan);
        }

        let childEntry = plan.children.find((c) => c.childId.equals(childId));
        if (!childEntry) {
          console.log("🟠 Creating new child entry in plan");
          plan.children.push({
            childId,
            meals: [{ mealDate: mealDateObj, mealName: dish }],
          });
        } else {
          const mealExists = childEntry.meals.some(
            (m) => new Date(m.mealDate).toISOString().slice(0, 10) === mealDate
          );

          if (!mealExists) {
            childEntry.meals.push({ mealDate: mealDateObj, mealName: dish });
          } else {
            childEntry.meals = childEntry.meals.map((m) =>
              new Date(m.mealDate).toISOString().slice(0, 10) === mealDate
                ? { ...m, mealName: dish }
                : m
            );
          }
        }
      }

      await userMeal.save();
      console.log("💾 UserMeal updated successfully for user:", userId);

      // 🔹 Step 7: Send confirmation email
      try {
        const form = await Form.findOne({ user: userId });
        if (form?.parentDetails?.email) {
          const parentName = `${form.parentDetails.fatherFirstName || ""} ${form.parentDetails.fatherLastName || ""}`.trim();
          const email = form.parentDetails.email;

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mealList = childrenData
            .map((c) => `🍱 ${c.dish} for ${mealDate}`)
            .join("<br>");

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Holiday Meal Payment Successful – LunchBowl",
            html: `
              <p>Hi ${parentName || "Parent"},</p>
              <p>Your payment for holiday meals has been successfully processed.</p>
              <p>${mealList}</p>
              <p>Order ID: <b>${order_id}</b></p>
              <p>Transaction ID: <b>${tracking_id}</b></p>
              <p>We hope your child enjoys their special meal!</p>
              <p>– Earth Tech Concepts Pvt Ltd</p>
            `,
          };

          await transporter.sendMail(mailOptions);
          console.log("📧 Confirmation email sent to:", email);
        }
      } catch (mailErr) {
        console.error("❌ Error sending email:", mailErr);
      }

      console.log("✅ Holiday Payment completed successfully!");
      return res.redirect("https://lunchbowl.co.in/payment/success");
    } catch (err) {
      console.error("💥 CCAvenue Holiday Payment Handler Error:", err);
      return res.status(500).send("Internal Server Error");
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




exports.addChildPaymentController = async (req, res) => {
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

      // 🔹 Decrypt the response from CCAvenue
      const decrypted = ccav.decrypt(encrypted, workingKey);
      const responseData = qs.parse(decrypted);

      const {
        order_id,
        tracking_id,
        order_status,
        merchant_param1: userId,
        merchant_param2: subscriptionId,
        merchant_param3,
      } = responseData;

      // Validate base data
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error("Invalid userId in Add Child Payment:", userId);
        return res.status(400).send("Invalid userId");
      }

      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        console.error("Invalid subscriptionId in Add Child Payment:", subscriptionId);
        return res.status(400).send("Invalid subscriptionId");
      }

      // 🔸 Parse childrenData (merchant_param3)
      let childrenData = [];
      try {
       if (merchant_param3) {
         const decoded = Buffer.from(merchant_param3, "base64").toString("utf-8");
         childrenData = JSON.parse(decoded);
         console.log("🟢 Decoded childrenData:", childrenData);
       } else {
         console.warn("⚠️ merchant_param3 missing or empty");
       }
     } catch (err) {
       console.error("❌ Error decoding childrenData:", err);
       return res.status(400).send("Malformed childrenData");
     }

      // 🔸 Process payment and save in UserPayment
      await processPaymentResponse(responseData, "subscription", "ADD_CHILD");

      if (order_status !== "Success") {
        return res.redirect("https://lunchbowl.co.in/payment/subscriptionFailed");
      }

      // 🔹 Fetch form and subscription
      const form = await Form.findOne({ user: userId }).populate("subscriptions");
      if (!form) {
        return res.status(404).send("Form not found");
      }

      const subscription = form.subscriptions.find(
        (sub) => sub._id.toString() === subscriptionId.toString()
      );

      if (!subscription) {
        return res.status(404).send("Subscription not found");

      }

      // 🔹 Save or update children
      const savedChildrenIds = [];
      for (const child of childrenData) {
        child.user = userId;
        let savedChild;

        if (child._id && mongoose.Types.ObjectId.isValid(child._id)) {
          savedChild = await Child.findOneAndUpdate(
            { _id: child._id, user: userId },
            child,
            { new: true, runValidators: true }
          );
          if (!savedChild) {
            const newChild = new Child(child);
            savedChild = await newChild.save();
          }
        } else {
          const newChild = new Child(child);
          savedChild = await newChild.save();
        }

        savedChildrenIds.push(savedChild._id);
      }

      // 🔹 Attach children to subscription
      if (!Array.isArray(subscription.children)) subscription.children = [];
      savedChildrenIds.forEach((childId) => {
        if (!subscription.children.some((c) => c.toString() === childId.toString())) {
          subscription.children.push(childId);
        }
      });

      // 🔹 Update payment details
      subscription.orderId = order_id;
      subscription.transactionId = tracking_id || "N/A";
      subscription.paymentDate = new Date();
      subscription.paymentMethod = "CCAvenue";
      await subscription.save();

      // 🔹 Update form details
      form.paymentStatus = "Success";
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;
      await form.save();

      // 🔹 Send confirmation email
      try {
        const parentName = `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`;
        const email = form.parentDetails.email;
        const amount = subscription.price || 0;

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
          subject: "Child Addition Payment Successful – LunchBowl",
          html: `
            <p>Hi ${parentName},</p>
            <p>Your payment for adding a new child has been successfully processed.</p>
            <p>💳 Order ID: ${order_id}</p>
            <p>📦 Transaction ID: ${tracking_id}</p>
            <p>Amount: ₹${amount}</p>
            <p>Your child’s details have been added to your LunchBowl subscription.</p>
            <p>– Earth Tech Concepts Pvt Ltd</p>
          `,
        };

        transporter.sendMail(mailOptions, (err) => {
          if (err) console.error("Add child email error:", err);
        });
      } catch (mailErr) {
        console.error("Mail sending error:", mailErr);
      }

      // 🔹 Redirect to success page
      return res.redirect("https://lunchbowl.co.in/user/menuCalendarPage");
    } catch (err) {
      console.error("Add Child live payment handler error:", err);
      return res.status(500).send("Internal Server Error");
    }
  });
};





//------------------------ Local Encryption Function and Payment Initiation (React) ------------------------//

exports.localPaymentSuccess = async (req, res) => {
  try {
    const { userId, orderId, transactionId } = req.body;

    if (!userId || !orderId) {
      return res.status(400).json({ success: false, message: "Missing userId or orderId" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const form = await Form.findOne({ user: userId }).populate("subscriptions");
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    let paidForValue = null;
    if (orderId.startsWith("R")) {
      paidForValue = "RENEW_SUBSCRIPTION";
    } else if (orderId.startsWith("L")) {
      paidForValue = "SUBSCRIPTION";
    }

    // 🟢 Handle Renewal (R-prefixed orderId)
    if (paidForValue === "RENEW_SUBSCRIPTION") {
      // 1️⃣ Find the most recent pending payment subscription
      let subscriptionToUpdate = form.subscriptions
        .filter((sub) => sub.status === "pending_payment")
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      if (!subscriptionToUpdate) {
        return res.status(404).json({
          success: false,
          message: "No pending subscription found for renewal payment",
        });
      }

      // 2️⃣ Determine final status (active/upcoming)
      const hasActive = form.subscriptions.some((s) => s.status === "active");
      const newStatus = hasActive ? "upcoming" : "active";

      // 3️⃣ Update subscription payment details
      subscriptionToUpdate.status = newStatus;
      subscriptionToUpdate.orderId = orderId;
      subscriptionToUpdate.transactionId = transactionId || null;
      subscriptionToUpdate.paymentDate = new Date();
      subscriptionToUpdate.paymentMethod = "CCAvenue";
      await subscriptionToUpdate.save();

      // 4️⃣ Update form info
      form.paymentStatus = "Success";
      form.step = 4;
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;
      await form.save();

      // 5️⃣ Save in UserPayment collection
      const paymentTransaction = {
        order_id: orderId,
        tracking_id: transactionId || null,
        amount: subscriptionToUpdate.price || 0,
        order_status: "Success",
        payment_mode: subscriptionToUpdate.paymentMethod || "CCAvenue",
        card_name: "",
        bank_ref_no: "",
        billing_name: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "",
        billing_email: form.parentDetails?.email || "",
        payment_date: new Date(),
        merchant_param1: userId,
        payment_type: "subscription-local",
        paidFor: paidForValue,
      };

      await UserPayment.findOneAndUpdate(
        { user: userId },
        {
          $push: { payments: paymentTransaction },
          $inc: { total_amount: paymentTransaction.amount },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );

      return res.json({ success: true, message: "Renewal payment simulated successfully", data: form });
    }

    // 🟣 Handle New Subscription (L-prefixed orderId)
    else if (paidForValue === "SUBSCRIPTION") {
      let subscriptionToUpdate = form.subscriptions.find((sub) => sub.orderId === orderId);

      if (!subscriptionToUpdate) {
        subscriptionToUpdate = form.subscriptions
          .filter((sub) => !sub.paymentDate)
          .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0];
      }

      if (!subscriptionToUpdate) {
        return res.status(404).json({
          success: false,
          message: "No suitable subscription found for payment update",
        });
      }

      subscriptionToUpdate.orderId = orderId;
      subscriptionToUpdate.transactionId = transactionId || null;
      subscriptionToUpdate.paymentDate = new Date();
      subscriptionToUpdate.paymentMethod = "CCAvenue";
      await subscriptionToUpdate.save();

      form.paymentStatus = "Success";
      form.step = 4;
      form.subscriptionCount = (form.subscriptionCount || 0) + 1;
      await form.save();

      const paymentTransaction = {
        order_id: orderId,
        tracking_id: transactionId || null,
        amount: subscriptionToUpdate.price || 0,
        order_status: "Success",
        payment_mode: subscriptionToUpdate.paymentMethod || "CCAvenue",
        card_name: "",
        bank_ref_no: "",
        billing_name: form.parentDetails
          ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
          : "",
        billing_email: form.parentDetails?.email || "",
        payment_date: new Date(),
        merchant_param1: userId,
        payment_type: "subscription-local",
        paidFor: paidForValue,
      };

      await UserPayment.findOneAndUpdate(
        { user: userId },
        {
          $push: { payments: paymentTransaction },
          $inc: { total_amount: paymentTransaction.amount },
          $setOnInsert: { created_at: new Date() },
        },
        { upsert: true, new: true, runValidators: true }
      );

      return res.json({ success: true, message: "New subscription payment simulated successfully", data: form });
    }

    // 🟥 Fallback
    return res.status(400).json({ success: false, message: "Invalid order prefix" });

  } catch (err) {
    console.error("Local payment success error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


exports.localAddChildPaymentController = async (req, res) => {
  try {
    const { userId, orderId, transactionId, formData, planId } = req.body;

    if (!userId || !orderId || !planId) {
      return res.status(400).json({ success: false, message: "Missing userId, orderId or planId" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ success: false, message: "Invalid userId or planId" });
    }

    const form = await Form.findOne({ user: userId }).populate("subscriptions");
    if (!form) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    let subscription = form.subscriptions.find(
      (sub) => sub._id.toString() === planId.toString()
    );
    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    const savedChildrenIds = [];
    if (Array.isArray(formData) && formData.length > 0) {
      for (const child of formData) {
        if (!child.location || child.location.trim() === "") {
          return res.status(400).json({
            success: false,
            message: `Child location is required for ${child.childFirstName || "unknown"}`,
          });
        }
        child.user = userId;
        if (child._id && mongoose.Types.ObjectId.isValid(child._id)) {
          const updatedChild = await Child.findOneAndUpdate(
            { _id: child._id, user: userId },
            child,
            { new: true, runValidators: true }
          );
          if (updatedChild) {
            savedChildrenIds.push(updatedChild._id);
          } else {
            const newChild = new Child(child);
            await newChild.save();
            savedChildrenIds.push(newChild._id);
          }
        } else {
          const newChild = new Child(child);
          await newChild.save();
          savedChildrenIds.push(newChild._id);
        }
      }
    }

    if (!Array.isArray(subscription.children)) {
      subscription.children = [];
    }

    savedChildrenIds.forEach((childId) => {
      if (!subscription.children.some((cId) => cId.toString() === childId.toString())) {
        subscription.children.push(childId);
      }
    });

    subscription.orderId = orderId;
    subscription.transactionId = transactionId || null;
    subscription.paymentDate = new Date();
    subscription.paymentMethod = "CCAvenue";

    await subscription.save();

    form.paymentStatus = "Success";
    form.subscriptionCount = (form.subscriptionCount || 0) + 1;

    await form.save();

    // Save payment in UserPayment collection
    const paymentTransaction = {
      order_id: orderId,
      tracking_id: transactionId || null,
      amount: subscription.price || 0,
      order_status: "Success",
      payment_mode: subscription.paymentMethod || "CCAvenue",
      card_name: "",
      bank_ref_no: "",
      billing_name: form.parentDetails
        ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
        : "",
      billing_email: form.parentDetails?.email || "",
      payment_date: new Date(),
      merchant_param1: userId,
      payment_type: "subscription-local-addchild",
      paidFor: "ADD_CHILD",  // <--- set here
    };


    await UserPayment.findOneAndUpdate(
      { user: userId },
      {
        $push: { payments: paymentTransaction },
        $inc: { total_amount: paymentTransaction.amount },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true, new: true, runValidators: true }
    );

    const updatedForm = await Form.findById(form._id)
      .populate({
        path: "subscriptions",
        populate: { path: "children" },
      });

    return res.json({ success: true, data: updatedForm });
  } catch (err) {
    console.error("Local add child payment error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
