import React, { useState } from "react";
import axios from "axios";
import CryptoJS from "crypto-js";
import { Button } from "@mui/material";

/**
 * AddUpcomingChildPayment
 * -----------------------
 * A targeted variant of AddChildPayment used to add an EXISTING (already-created)
 * child to a subscription that is NOT the active one — specifically an "upcoming"
 * subscription — and collect a full-term payment for it via CCAvenue.
 *
 * It reuses the existing backend handlers unchanged:
 *   - live:  POST https://api.lunchbowl.co.in/api/ccavenue/response/addChildPayment
 *   - local: POST <api>/api/ccavenue/local-success/local-add-childPayment
 * Both attach the child(ren) to the subscription passed as `merchant_param2`
 * (live) / `paymentInfo.subscriptionId` (local).
 *
 * Props:
 *   _id           : userId (string)
 *   subscription  : the target subscription object (must contain `_id`)
 *   childrenData  : array of child objects to add (must each contain `_id`)
 *   totalAmount   : amount to charge (number)
 *   onError(msg)  : called on failure
 *   onSuccess()   : called on local-sim success
 */
const AddUpcomingChildPayment = ({
  _id,
  subscription,
  childrenData,
  totalAmount,
  onError,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);

  // Same live CCAvenue credentials as the standard Add-Child flow.
  const ccavenueConfig = {
    merchant_id: "4381442",
    access_code: "AVRM80MF59BY86MRYB",
    working_key: "2A561B005709D8B4BAF69D049B23546B",
    redirect_url_live:
      "https://api.lunchbowl.co.in/api/ccavenue/response/addChildPayment",
    cancel_url_live:
      "https://api.lunchbowl.co.in/api/ccavenue/response/addChildPayment",
    currency: "INR",
    language: "EN",
    endpoint:
      "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
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

  const generateOrderId = () =>
    `LB${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const isDevLikeHost = () => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("dev.") ||
      host.includes("dev-")
    );
  };

  // TEMPORARY OVERRIDE: force the real CCAvenue gateway even on localhost/dev.
  // Trigger by adding ?live=1 to the page URL, or NEXT_PUBLIC_FORCE_CCAVENUE_LIVE=true.
  // NOTE: the live gateway redirects to the PRODUCTION backend, so a completed
  // payment attaches the child in PRODUCTION (not your local DB).
  const isForceLive = () => {
    if (process.env.NEXT_PUBLIC_FORCE_CCAVENUE_LIVE === "true") return true;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("live") === "1";
  };

  // Derive the API origin from the configured base URL so the local
  // simulation hits the SAME backend the rest of the app uses
  // (fixes the hard-coded :5056 in the original AddChildPayment).
  const getApiOrigin = () => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const origin = base.replace(/\/api\/?$/, "");
    if (origin) return origin;
    // Fallbacks
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1")
        return "http://localhost:5055";
      if (host.startsWith("dev.") || host.includes("dev-"))
        return "https://dev-api.lunchbowl.co.in";
    }
    return "https://api.lunchbowl.co.in";
  };

  // Keep only schema fields so backend validators don't choke on _id/__v/isExisting.
  const sanitizeChild = (c) => ({
    _id: c._id,
    childFirstName: c.childFirstName,
    childLastName: c.childLastName,
    dob:
      c.dob && typeof c.dob === "string" ? c.dob.slice(0, 10) : c.dob || "",
    lunchTime: c.lunchTime,
    school: c.school,
    location: c.location,
    childClass: c.childClass,
    section: c.section,
    allergies: c.allergies || "",
  });

  const initiatePayment = async () => {
    setLoading(true);
    try {
      const userId = _id;
      const subscriptionId = subscription?._id;
      const cleanChildren = (childrenData || []).map(sanitizeChild);

      if (!userId) throw new Error("User ID not provided");
      if (!subscriptionId) throw new Error("Target subscription not found");
      if (cleanChildren.length === 0)
        throw new Error("No child selected to add");
      if (!totalAmount || totalAmount <= 0)
        throw new Error("Invalid payment amount");

      const orderId = generateOrderId();

      if (isDevLikeHost() && !isForceLive()) {
        // --- Local simulation (no real money) ---
        const origin = getApiOrigin();
        const res = await axios.post(
          `${origin}/api/ccavenue/local-success/local-add-childPayment`,
          {
            userId,
            childrenData: cleanChildren,
            paymentInfo: {
              orderId,
              transactionId: `TXN${Date.now()}`,
              subscriptionId,
              paymentAmount: totalAmount,
            },
          }
        );

        if (res.data?.success) {
          onSuccess && onSuccess();
        } else {
          onError && onError(res.data?.message || "Local payment failed");
        }
      } else {
        // --- Live CCAvenue checkout ---
        const paymentData = {
          merchant_id: ccavenueConfig.merchant_id,
          order_id: orderId,
          amount: Number(totalAmount).toFixed(2),
          currency: ccavenueConfig.currency,
          redirect_url: ccavenueConfig.redirect_url_live,
          cancel_url: ccavenueConfig.cancel_url_live,
          language: ccavenueConfig.language,
          merchant_param1: userId, // customer id
          merchant_param2: subscriptionId, // ✅ target = upcoming subscription
          merchant_param3: btoa(JSON.stringify(cleanChildren)), // children to attach
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
      }
    } catch (err) {
      console.error("AddUpcomingChildPayment error:", err);
      onError && onError(err.message || "Payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="contained"
      color="primary"
      onClick={initiatePayment}
      disabled={loading}
      className="proceedbtn"
    >
      <span>{loading ? "Processing Payment..." : `Pay ₹${totalAmount}`}</span>
    </Button>
  );
};

export default AddUpcomingChildPayment;
