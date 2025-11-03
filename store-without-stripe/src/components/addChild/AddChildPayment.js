import React, { useState } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { Button } from "@mui/material";

const AddChildPayment = ({ _id, formData, subscriptionPlan, onError, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  // CCAvenue payment config (replace with your real config)
  const ccavenueConfig = {
    merchant_id: "4381442",
    access_code: "AVRM80MF59BY86MRYB",
    working_key: "2A561B005709D8B4BAF69D049B23546B",
    redirect_url_live: "https://api.lunchbowl.co.in/api/ccavenue/response/addChildPayment",
    cancel_url_live: "https://api.lunchbowl.co.in/api/ccavenue/response/addChildPayment",
    currency: "INR",
    language: "EN",
    endpoint: "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
  };

  const encrypt = (plainText, workingKey) => {
    const md5Hash = CryptoJS.MD5(CryptoJS.enc.Utf8.parse(workingKey));
    const key = CryptoJS.enc.Hex.parse(md5Hash.toString(CryptoJS.enc.Hex));
    const iv = CryptoJS.enc.Hex.parse("000102030405060708090a0b0c0d0e0f");

    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(plainText),
      key,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return encrypted.ciphertext.toString();
  };

  const generateOrderId = () => `LB${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const isLocalhost = () => {
    if (typeof window === "undefined") return false;
    const hostname = window.location.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  };

  const initiatePayment = async () => {
    setLoading(true);
    try {
      const orderId = generateOrderId();

      if (isLocalhost()) {
        // Local environment: call local API directly with children data and planId
        const localApiUrl = "http://localhost:5056/api/ccavenue/local-success/local-add-childPayment";
        const response = await axios.post(localApiUrl, {
          userId: _id,
          orderId,
          transactionId: `TXN${Date.now()}`, // dummy transactionId for local
          formData,                         // pass children details here
          planId: subscriptionPlan?._id, // pass subscription plan ID
        });

        if (response.data.success) {
          onSuccess();
        } else {
          onError(response.data.message || "Local payment simulation failed");
        }
      } else {
        // Live environment: open CCAvenue payment gateway with updated URLs and encrypted data
        if (!subscriptionPlan || !subscriptionPlan.price || !subscriptionPlan.planId) {
          throw new Error("Invalid subscription plan data");
        }

        const paymentData = {
          merchant_id: ccavenueConfig.merchant_id,
          order_id: orderId,
          amount: subscriptionPlan.price.toFixed(2),
          currency: ccavenueConfig.currency,
          redirect_url: ccavenueConfig.redirect_url_live,
          cancel_url: ccavenueConfig.cancel_url_live,
          language: ccavenueConfig.language,
          merchant_param1: _id,
          merchant_param2: subscriptionPlan.planId,
          merchant_param3: orderId,
          // Add more fields as needed (billing info, etc.)
        };

        const plainText = Object.entries(paymentData)
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
          .join("&");

        const encryptedData = encrypt(plainText, ccavenueConfig.working_key);

        const form = document.createElement("form");
        form.method = "POST";
        form.action = ccavenueConfig.endpoint;
        form.style.display = "none";

        const createInput = (name, value) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        };

        createInput("encRequest", encryptedData);
        createInput("access_code", ccavenueConfig.access_code);

        document.body.appendChild(form);
        form.submit();

        // onSuccess will be called after payment response handled by your backend asynchronously
      }
    } catch (e) {
      onError(e.message || "Payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="contained" color="primary" onClick={initiatePayment} disabled={loading}>
      {loading ? "Processing Payment..." : "Make Payment"}
    </Button>
  );
};

export default AddChildPayment;
