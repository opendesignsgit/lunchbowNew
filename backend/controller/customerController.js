require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const UserMeal = require("../models/UserMeal");
const dayjs = require("dayjs");
const nodemailer = require("nodemailer");
const { signInToken, tokenForVerify } = require("../config/auth");
const { sendEmail } = require("../lib/email-sender/sender");
const {
  customerRegisterBody,
} = require("../lib/email-sender/templates/register");
const {
  forgetPasswordEmailBody,
} = require("../lib/email-sender/templates/forget-password");
const { sendVerificationCode } = require("../lib/phone-verification/sender");
const { sendSMS } = require("../lib/sms-sender/smsService");
const SmsLog = require("../models/SmsLog");
const Otp = require("../models/Otp");
const Form = require("../models/Form");
const mongoose = require("mongoose");
const HolidayPayment = require("../models/HolidayPayment");

const verifyEmailAddress = async (req, res) => {
  const isAdded = await Customer.findOne({ email: req.body.email });
  if (isAdded) {
    return res.status(403).send({
      message: "This Email already Added!",
    });
  } else {
    const token = tokenForVerify(req.body);
    const option = {
      name: req.body.name,
      email: req.body.email,
      token: token,
    };
    const body = {
      from: process.env.EMAIL_USER,
      // from: "info@demomailtrap.com",
      to: `${req.body.email}`,
      subject: "Email Activation",
      subject: "Verify Your Email",
      html: customerRegisterBody(option),
    };

    const message = "Please check your email to verify your account!";
    sendEmail(body, res, message);
  }
};

const verifyPhoneNumber = async (req, res) => {
  const phoneNumber = req.body.phone;

  // console.log("verifyPhoneNumber", phoneNumber);

  // Check if phone number is provided and is in the correct format
  if (!phoneNumber) {
    return res.status(400).send({
      message: "Phone number is required.",
    });
  }

  // Optional: Add phone number format validation here (if required)
  // const phoneRegex = /^[0-9]{10}$/; // Basic validation for 10-digit phone numbers
  // if (!phoneRegex.test(phoneNumber)) {
  //   return res.status(400).send({
  //     message: "Invalid phone number format. Please provide a valid number.",
  //   });
  // }

  try {
    // Check if the phone number is already associated with an existing customer
    const isAdded = await Customer.findOne({ phone: phoneNumber });

    if (isAdded) {
      return res.status(403).send({
        message: "This phone number is already added.",
      });
    }

    // Generate a random 6-digit verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Send verification code via SMS
    const sent = await sendVerificationCode(phoneNumber, verificationCode);

    if (!sent) {
      return res.status(500).send({
        message: "Failed to send verification code.",
      });
    }

    const message = "Please check your phone for the verification code!";
    return res.send({ message });
  } catch (err) {
    console.error("Error during phone verification:", err);
    res.status(500).send({
      message: err.message,
    });
  }
};

const registerCustomer = async (req, res) => {
  const token = req.params.token;

  try {
    const { name, email, password } = jwt.decode(token);

    // Check if the user is already registered
    const isAdded = await Customer.findOne({ email });

    if (isAdded) {
      const token = signInToken(isAdded);
      return res.send({
        token,
        _id: isAdded._id,
        name: isAdded.name,
        email: isAdded.email,
        password: password,
        message: "Email Already Verified!",
      });
    }

    if (token) {
      jwt.verify(
        token,
        process.env.JWT_SECRET_FOR_VERIFY,
        async (err, decoded) => {
          if (err) {
            return res.status(401).send({
              message: "Token Expired, Please try again!",
            });
          }

          // Create a new user only if not already registered
          const existingUser = await Customer.findOne({ email });
          console.log("existingUser");

          if (existingUser) {
            return res.status(400).send({ message: "User already exists!" });
          } else {
            const newUser = new Customer({
              name,
              email,
              password: bcrypt.hashSync(password),
            });

            await newUser.save();

            // Send signup confirmation SMS if phone number is available
            if (newUser.phone) {
              try {
                const smsResult = await sendSMS(newUser.phone, 'SIGNUP_CONFIRMATION', [newUser.name]);

                // Log SMS
                const smsLog = new SmsLog({
                  mobile: newUser.phone,
                  messageType: 'SIGNUP_CONFIRMATION',
                  message: smsResult.message || '',
                  templateId: smsResult.templateId || '',
                  messageId: smsResult.messageId || '',
                  status: smsResult.success ? 'sent' : 'failed',
                  error: smsResult.error || undefined,
                  customerId: newUser._id,
                  variables: [newUser.name],
                  sentAt: new Date()
                });

                await smsLog.save();
                console.log('Signup confirmation SMS sent to:', newUser.phone);
              } catch (smsError) {
                console.error('Error sending signup confirmation SMS:', smsError);
                // Don't fail registration if SMS fails
              }
            }

            const token = signInToken(newUser);
            res.send({
              token,
              _id: newUser._id,
              name: newUser.name,
              email: newUser.email,
              message: "Email Verified, Please Login Now!",
            });
          }
        }
      );
    }
  } catch (error) {
    console.error("Error during email verification:", error);
    res.status(500).send({
      message: "Internal server error. Please try again later.",
    });
  }
};

const addAllCustomers = async (req, res) => {
  try {
    await Customer.deleteMany();
    await Customer.insertMany(req.body);
    res.send({
      message: "Added all users successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// const loginCustomer = async (req, res) => {
//   try {
//     const customer = await Customer.findOne({ email: req.body.email });

//     // console.log("loginCustomer", req.body.password, "customer", customer);

//     if (
//       customer &&
//       customer.password &&
//       bcrypt.compareSync(req.body.password, customer.password)
//     ) {
//       const token = signInToken(customer);
//       res.send({
//         token,
//         _id: customer._id,
//         name: customer.name,
//         email: customer.email,
//         address: customer.address,
//         phone: customer.phone,
//         image: customer.image,
//       });
//     } else {
//       res.status(401).send({
//         message: "Invalid user or password!",
//         error: "Invalid user or password!",
//       });
//     }
//   } catch (err) {
//     res.status(500).send({
//       message: err.message,
//       error: "Invalid user or password!",
//     });
//   }
// };

const forgetPassword = async (req, res) => {
  const isAdded = await Customer.findOne({ email: req.body.email });
  if (!isAdded) {
    return res.status(404).send({
      message: "User Not found with this email!",
    });
  } else {
    const token = tokenForVerify(isAdded);
    const option = {
      name: isAdded.name,
      email: isAdded.email,
      token: token,
    };

    const body = {
      from: process.env.EMAIL_USER,
      to: `${req.body.email}`,
      subject: "Password Reset",
      html: forgetPasswordEmailBody(option),
    };

    const message = "Please check your email to reset password!";
    sendEmail(body, res, message);
  }
};

const resetPassword = async (req, res) => {
  const token = req.body.token;
  const { email } = jwt.decode(token);
  const customer = await Customer.findOne({ email: email });

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET_FOR_VERIFY, (err, decoded) => {
      if (err) {
        return res.status(500).send({
          message: "Token expired, please try again!",
        });
      } else {
        customer.password = bcrypt.hashSync(req.body.newPassword);
        customer.save();
        res.send({
          message: "Your password change successful, you can login now!",
        });
      }
    });
  }
};

const changePassword = async (req, res) => {
  try {
    // console.log("changePassword", req.body);
    const customer = await Customer.findOne({ email: req.body.email });
    if (!customer.password) {
      return res.status(403).send({
        message:
          "For change password,You need to sign up with email & password!",
      });
    } else if (
      customer &&
      bcrypt.compareSync(req.body.currentPassword, customer.password)
    ) {
      customer.password = bcrypt.hashSync(req.body.newPassword);
      await customer.save();
      res.send({
        message: "Your password change successfully!",
      });
    } else {
      res.status(401).send({
        message: "Invalid email or current password!",
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const signUpWithProvider = async (req, res) => {
  try {
    // const { user } = jwt.decode(req.body.params);
    const user = jwt.decode(req.params.token);

    // console.log("user", user);
    const isAdded = await Customer.findOne({ email: user.email });
    if (isAdded) {
      const token = signInToken(isAdded);
      res.send({
        token,
        _id: isAdded._id,
        name: isAdded.name,
        email: isAdded.email,
        address: isAdded.address,
        phone: isAdded.phone,
        image: isAdded.image,
      });
    } else {
      const newUser = new Customer({
        name: user.name,
        email: user.email,
        image: user.picture,
      });

      const signUpCustomer = await newUser.save();
      const token = signInToken(signUpCustomer);
      res.send({
        token,
        _id: signUpCustomer._id,
        name: signUpCustomer.name,
        email: signUpCustomer.email,
        image: signUpCustomer.image,
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const signUpWithOauthProvider = async (req, res) => {
  try {
    // console.log("user", user);
    // console.log("signUpWithOauthProvider", req.body);
    const isAdded = await Customer.findOne({ email: req.body.email });
    if (isAdded) {
      const token = signInToken(isAdded);
      res.send({
        token,
        _id: isAdded._id,
        name: isAdded.name,
        email: isAdded.email,
        address: isAdded.address,
        phone: isAdded.phone,
        image: isAdded.image,
      });
    } else {
      const newUser = new Customer({
        name: req.body.name,
        email: req.body.email,
        image: req.body.image,
      });

      const signUpCustomer = await newUser.save();
      const token = signInToken(signUpCustomer);
      res.send({
        token,
        _id: signUpCustomer._id,
        name: signUpCustomer.name,
        email: signUpCustomer.email,
        image: signUpCustomer.image,
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getAllCustomers = async (req, res) => {
  try {
    const users = await Customer.find({}).sort({ _id: -1 });
    res.send(users);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const user = await Customer.findById(req.params.id);
    const form = await Form.findOne({ user: req.params.id });
    const customer = { user, form };
    res.send(customer);
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

// Shipping address create or update
const addShippingAddress = async (req, res) => {
  try {
    const customerId = req.params.id;
    const newShippingAddress = req.body;

    // Find the customer by ID and update the shippingAddress field
    const result = await Customer.updateOne(
      { _id: customerId },
      {
        $set: {
          shippingAddress: newShippingAddress,
        },
      },
      { upsert: true } // Create a new document if no document matches the filter
    );

    if (result.nModified > 0 || result.upserted) {
      return res.send({
        message: "Shipping address added or updated successfully.",
      });
    } else {
      return res.status(404).send({ message: "Customer not found." });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const getShippingAddress = async (req, res) => {
  try {
    const customerId = req.params.id;
    // const addressId = req.query.id;

    // console.log("getShippingAddress", customerId);
    // console.log("addressId", req.query);

    const customer = await Customer.findById(customerId);
    res.send({ shippingAddress: customer?.shippingAddress });

    // if (addressId) {
    //   // Find the specific address by its ID
    //   const address = customer.shippingAddress.find(
    //     (addr) => addr._id.toString() === addressId.toString()
    //   );

    //   if (!address) {
    //     return res.status(404).send({
    //       message: "Shipping address not found!",
    //     });
    //   }

    //   return res.send({ shippingAddress: address });
    // } else {
    //   res.send({ shippingAddress: customer?.shippingAddress });
    // }
  } catch (err) {
    // console.error("Error adding shipping address:", err);
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateShippingAddress = async (req, res) => {
  try {
    const activeDB = req.activeDB;

    const Customer = activeDB.model("Customer", CustomerModel);
    const customer = await Customer.findById(req.params.id);

    if (customer) {
      customer.shippingAddress.push(req.body);

      await customer.save();
      res.send({ message: "Success" });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const deleteShippingAddress = async (req, res) => {
  try {
    const activeDB = req.activeDB;
    const { userId, shippingId } = req.params;

    const Customer = activeDB.model("Customer", CustomerModel);
    await Customer.updateOne(
      { _id: userId },
      {
        $pull: {
          shippingAddress: { _id: shippingId },
        },
      }
    );

    res.send({ message: "Shipping Address Deleted Successfully!" });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    // Validate the input
    const { name, email, address, phone, image } = req.body;

    // Find the customer by ID
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).send({
        message: "Customer not found!",
      });
    }

    // Check if the email already exists and does not belong to the current customer
    const existingCustomer = await Customer.findOne({ email });
    if (
      existingCustomer &&
      existingCustomer._id.toString() !== customer._id.toString()
    ) {
      return res.status(400).send({
        message: "Email already exists.",
      });
    }

    // Update customer details
    customer.name = name;
    customer.email = email;
    customer.address = address;
    customer.phone = phone;
    customer.image = image;

    // Save the updated customer
    const updatedUser = await customer.save();

    // Generate a new token
    const token = signInToken(updatedUser);

    // Send the updated customer data with the new token
    res.send({
      token,
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      address: updatedUser.address,
      phone: updatedUser.phone,
      image: updatedUser.image,
      message: "Customer updated successfully!",
    });
  } catch (err) {
    res.status(500).send({
      message: err.message,
    });
  }
};

const deleteCustomer = (req, res) => {
  Customer.deleteOne({ _id: req.params.id }, (err) => {
    if (err) {
      res.status(500).send({
        message: err.message,
      });
    } else {
      res.status(200).send({
        message: "User Deleted Successfully!",
      });
    }
  });
};

// Send OTP
const sendOtp = async (req, res) => {
  try {
    const { email, mobile, path } = req.body;

    if (!mobile) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    // Only allow signUp or logIn for sending OTP
    if (!["signUp", "logIn"].includes(path)) {
      return res.status(400).json({ message: "Invalid path" });
    }

    // Signup flow - number must NOT exist
    if (path === "signUp") {
      const existingUser = await Customer.findOne({ phone: mobile });
      if (existingUser) {
        return res.status(400).json({ message: "Mobile number already registered" });
      }
    }

    if (path === "signUp") {
      const existingUser = await Customer.findOne({ email: email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    // Login flow - number MUST exist
    if (path === "logIn") {
      const existingUser = await Customer.findOne({ phone: mobile });
      if (!existingUser) {
        return res.status(400).json({ message: "Mobile number is not registered" });
      }
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 min expiry

    // Remove old OTPs for this mobile
    await Otp.deleteMany({ mobile });

    // Save new OTP
    await Otp.create({ mobile, otp, expiresAt });

    try {
      const smsResult = await sendSMS(mobile, "OTP", [otp]);
      console.log("OTP SMS Result:", smsResult);

      const smsLog = new SmsLog({
        mobile,
        messageType: "OTP",
        message: smsResult.message || "",
        templateId: smsResult.templateId || "",
        messageId: smsResult.messageId || "",
        status: smsResult.success ? "sent" : "failed",
        error: smsResult.error || undefined,
        variables: [otp],
        sentAt: new Date(),
      });

      await smsLog.save();

      if (smsResult.success) {
        return res.status(200).json({
          success: true,
          message: "OTP sent successfully via SMS",
          smsLogId: smsLog,
          expiresAt,
        });
      } else {
        return res.status(500).json({
          message: "Failed to send OTP. Please try again.",
          error: smsResult.error,
        });
      }
    } catch (smsError) {
      console.error("Error sending OTP SMS:", smsError);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again.",
        error: smsError.message,
      });
    }
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, otp, path, freeTrialCheck } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ message: "Mobile number and OTP are required" });
    }

    // Only allow signUp-otp or logIn-otp for verification
    if (!["signUp-otp", "logIn-otp"].includes(path)) {
      return res.status(400).json({ message: "Invalid path" });
    }

    const existingOtp = await Otp.findOne({ mobile });
    if (!existingOtp) {
      return res.status(400).json({ message: "OTP not found or expired" });
    }

    if (existingOtp.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (existingOtp.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    await Otp.deleteOne({ mobile }); // cleanup after successful verification

    if (path === "signUp-otp") {
      const result = await createCustomer({
        firstName,
        lastName,
        mobile,
        email,
        freeTrialCheck,
      });

      if (email) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const smsResult = await sendSMS(mobile, 'SIGNUP_CONFIRMATION', [firstName]);


        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Welcome to Lunch Bowl – You're All Set!",
          html: `
            <p>Hi ${firstName} ${lastName},</p>
            <p>Your Lunch Bowl account has been successfully created. You can now explore wholesome meals for your child delivered right to their school.</p>
            <p>🎉 Start by selecting your preferred meals:</p>
            <p>🔗 <a href="https://lunchbowl.co.in">lunchbowl.co.in</a></p>
            <p>We’re happy to have you with us!</p>
            <p>– Team Lunch Bowl</p>
          `,
        };

        // Send email (do not block response if fails)
        transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            console.error("Sign-Up Completion Mail Error:", err);
          }
        });
      }

      return res.status(200).json(result);
    }

    if (path === "logIn-otp") {
      const result = await loginCustomer(mobile);
      if (result && result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(401).json({
          success: false,
          message: "Login failed",
        });
      }
    }

    return res.status(400).json({ message: "Invalid path" });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Create Customer
const createCustomer = async ({ firstName, lastName, mobile, email, freeTrialCheck }) => {
  const newUser = new Customer({
    name: `${firstName} ${lastName}`,
    phone: mobile,
    email,
  });

  await newUser.save();

  const token = signInToken(newUser);

  return {
    success: true,
    token,
    _id: newUser._id,
    name: newUser.name,
    email: newUser.email,
    phone: newUser.phone,
    message: "Registration successful!",
    freeTrialCheck,
  };
};

// Login Customer
const loginCustomer = async (mobile) => {
  try {
    const customer = await Customer.findOne({ phone: mobile });
    if (customer) {
      const token = signInToken(customer);
      return {
        success: true,
        token,
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        freeTrial: customer.freeTrial || false,
        message: "Log in successful!",
      };
    }
    return { success: false, message: "User not found" };
  } catch (error) {
    console.error("Error during login:", error);
    return { success: false, message: "Login failed" };
  }
};




const stepFormRegister = async (req, res) => {
  try {
    const { formData, path, payload, _id, step } = req.body;

    // Validate required fields
    if (!_id || !path) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: _id and path",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    let update = { step };

    if (path === "step-Form-ParentDetails") {
      update.parentDetails = formData;
    } else if (path === "step-Form-ChildDetails") {
      update.children = formData;
    } else if (path === "step-Form-SubscriptionPlan") {
      if (
        !payload ||
        !payload.selectedPlan ||
        !payload.startDate ||
        !payload.endDate ||
        !payload.workingDays ||
        !payload.totalPrice
      ) {
        return res.status(400).json({
          success: false,
          message: "Missing required subscription plan fields",
        });
      }
      update.subscriptionPlan = {
        planId: payload.selectedPlan,
        startDate: payload.startDate,
        endDate: payload.endDate,
        workingDays: payload.workingDays,
        price: payload.totalPrice,
      };
    } else if (path === "step-Form-Payment") {
      // Handle payment status update
      if (typeof payload.paymentStatus !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Invalid payment status",
        });
      }
      update.paymentStatus = payload.paymentStatus;
      if (payload.paymentStatus) {
        update.$inc = { subscriptionCount: 1 };
        update.subscriptionPlan = {
          ...update.subscriptionPlan,
          paymentDate: new Date(),
          paymentMethod: "CCAvenue",
          transactionId: payload.transactionId || null,
        };
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid path parameter",
      });
    }

    const form = await Form.findOneAndUpdate(
      { user: _id },
      { $set: update },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, data: form });
  } catch (error) {
    console.error("Error during stepFormRegister:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const handleCCAvenueResponse = async (req, res) => {
  try {
    const { encResponse } = req.body;

    if (!encResponse) {
      return res
        .status(400)
        .json({ success: false, message: "No response data received" });
    }

    // Decrypt logic would be here, but it's better in the route file
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("CCAvenue response error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const verifyCCAvenuePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const form = await Form.findOne({ "subscriptionPlan.orderId": orderId });

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: form.paymentStatus,
      message: form.paymentStatus
        ? "Payment verified successfully"
        : "Payment not verified",
      data: form,
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const stepCheck = async (req, res) => {
  try {
    const _id = req.body._id;

    if (!_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const form = await Form.findOne({ user: mongoose.Types.ObjectId(_id) });

    const customer = await Customer.findById(_id);

    const freeTrial = customer ? customer.freeTrial : false;

    // If form not found, return step 1 as default
    // If found, return the form's step
    const step = form ? form.step : 1;

    res.status(200).json({
      success: true, data: {
        step,
        freeTrial,
      },
    });
  } catch (error) {
    console.error("Error in stepCheck:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getMenuCalendarDate = async (req, res) => {
  try {
    const { _id, path } = req.body;

    if (!_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const form = await Form.findOne({ user: mongoose.Types.ObjectId(_id) });

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Form not found",
      });
    }

    // Check if subscriptionPlan exists
    if (!form.subscriptionPlan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    const { startDate, endDate } = form.subscriptionPlan;

    // Safely map children names
    const childrenNames =
      form.children?.map((child) => ({
        id: child._id?.$oid || child._id,
        firstName: child.childFirstName,
        lastName: child.childLastName,
      })) || [];

    return res.status(200).json({
      success: true,
      data: {
        startDate,
        endDate,
        children: childrenNames,
      },
    });
  } catch (error) {
    console.error("Error in getMenuCalendarDate:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const saveMealPlans = async (req, res) => {
  try {
    // Extract data from your specific payload structure
    const { _id, path, data } = req.body;

    if (!data || !data.userId || !data.children) {
      return res.status(400).json({
        success: false,
        message: "Invalid request data: Missing required fields",
      });
    }

    const { userId, children } = data;

    // Validate children array
    if (!Array.isArray(children) || children.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid children data: Must be a non-empty array",
      });
    }

    // Process each child's meals
    const processedChildren = children.map((child) => {
      if (!child.childId || !Array.isArray(child.meals)) {
        throw new Error("Invalid child data structure");
      }

      return {
        childId: mongoose.Types.ObjectId(child.childId),
        meals: child.meals.map((meal) => {
          if (!meal.mealDate || !meal.mealName) {
            throw new Error("Invalid meal data structure");
          }

          // Convert string date to Date object
          let mealDate;
          try {
            mealDate = new Date(meal.mealDate);
            if (isNaN(mealDate.getTime())) {
              throw new Error("Invalid date format");
            }
          } catch (error) {
            throw new Error(`Invalid meal date: ${meal.mealDate}`);
          }

          return {
            mealDate,
            mealName: meal.mealName,
          };
        }),
      };
    });

    // Find existing user meal plan
    const existingPlan = await UserMeal.findOne({
      userId: mongoose.Types.ObjectId(userId),
    });

    if (existingPlan) {
      for (const newChild of processedChildren) {
        const childIndex = existingPlan.children.findIndex(
          (c) => c.childId.toString() === newChild.childId.toString()
        );
        if (childIndex >= 0) {
          // Merge meals for existing child
          for (const newMeal of newChild.meals) {
            const mealIndex = existingPlan.children[childIndex].meals.findIndex(
              (m) =>
                new Date(m.mealDate).toISOString() ===
                new Date(newMeal.mealDate).toISOString()
            );
            if (mealIndex >= 0) {
              // Update existing meal for the date
              existingPlan.children[childIndex].meals[mealIndex] = newMeal;
            } else {
              // Add new meal for the date
              existingPlan.children[childIndex].meals.push(newMeal);
            }
          }
        } else {
          // Add new child with meals if not present
          existingPlan.children.push(newChild);
        }
      }
      await existingPlan.save();

      return res.status(200).json({
        success: true,
        message: "Meal plans updated successfully",
        data: existingPlan,
      });
    } else {
      // Create new plan
      const newUserMeal = new UserMeal({
        userId: mongoose.Types.ObjectId(userId),
        children: processedChildren,
      });

      await newUserMeal.save();

      return res.status(201).json({
        success: true,
        message: "Meal plans created successfully",
        data: newUserMeal,
      });
    }
  } catch (error) {
    console.error("Error saving meal plans:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process meal plans",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

const getSavedMeals = async (req, res) => {
  try {
    const { _id } = req.body;

    if (!mongoose.Types.ObjectId.isValid(_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // Find user's saved meals
    const userMeals = await UserMeal.findOne({
      userId: mongoose.Types.ObjectId(_id),
    });

    if (!userMeals) {
      return res.status(404).json({
        success: false,
        message: "No saved meals found",
      });
    }

    // Transform data for frontend
    const transformedData = {
      menuSelections: {},
    };

    userMeals.children.forEach((child) => {
      child.meals.forEach((meal) => {
        const dateKey = dayjs(meal.mealDate).format("YYYY-MM-DD");
        if (!transformedData.menuSelections[dateKey]) {
          transformedData.menuSelections[dateKey] = {};
        }
        // Changed from child.childId._id to child.childId since we're not populating
        transformedData.menuSelections[dateKey][child.childId.toString()] =
          meal.mealName;
      });
    });

    return res.status(200).json({
      success: true,
      data: transformedData,
    });
  } catch (error) {
    console.error("Error fetching saved meals:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const accountDetails = async (req, res) => {
  try {
    const { userId, updateField, updateValue } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // If updateField and updateValue are present, perform update in both schemas
    if (
      updateField &&
      ["email", "mobile"].includes(updateField) &&
      updateValue
    ) {
      // Update Customer schema
      const customerUpdate = {};
      if (updateField === "email") customerUpdate.email = updateValue;
      if (updateField === "mobile") customerUpdate.phone = updateValue;
      await Customer.findByIdAndUpdate(userId, customerUpdate);

      // Update Form schema (parentDetails)
      const form = await Form.findOne({ user: userId });
      if (form && form.parentDetails) {
        if (updateField === "email") form.parentDetails.email = updateValue;
        if (updateField === "mobile") form.parentDetails.mobile = updateValue;
        await form.save();
      }
    }

    // Always return latest details
    const user = await Form.findOne({ user: mongoose.Types.ObjectId(userId) });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching/updating account details:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getFormData = async (req, res) => {
  try {
    const form = await Form.findOne({ user: req.params.userId })
      .populate("user")
      .lean();

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Form data not found for this user",
      });
    }

    res.status(200).json({
      success: true,
      data: form,
    });
  } catch (error) {
    console.error("Error fetching form data:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getPaidHolidays = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Find all paid holiday records for the user where paymentStatus is "Paid"
    const paidHolidays = await HolidayPayment.find({
      userId,
      paymentStatus: "Paid",
    }).lean();

    if (!paidHolidays || paidHolidays.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No paid holidays found for this user",
      });
    }

    res.status(200).json({
      success: true,
      data: paidHolidays,
    });
  } catch (error) {
    console.error("Error fetching paid holidays:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Helper function to check if date is in current month
function isDateInCurrentMonth(date, currentMonth) {
  const mealDate = new Date(date);
  return mealDate.getMonth() === currentMonth;
}

module.exports = {
  loginCustomer,
  verifyPhoneNumber,
  registerCustomer,
  addAllCustomers,
  signUpWithProvider,
  signUpWithOauthProvider,
  verifyEmailAddress,
  forgetPassword,
  changePassword,
  resetPassword,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  addShippingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  sendOtp,
  verifyOtp,
  stepFormRegister,
  handleCCAvenueResponse,
  verifyCCAvenuePayment,
  getMenuCalendarDate,
  saveMealPlans,
  getSavedMeals,
  stepCheck,
  accountDetails,
  getFormData,
  getPaidHolidays
};
