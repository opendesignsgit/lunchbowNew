import React, { useState, useEffect } from "react";
import { Button } from "@mui/material";
import PaymentServices from "@services/PaymentServices";
import { getApiErrorMessage } from "@services/httpServices";
import {
  postToGateway,
  isDevLikeHost,
  toChildPayload,
} from "@lib/ccavenueCheckout";

/**
 * Adds children to the ACTIVE plan. The server prices the payment (remaining
 * working days × daily rate × new children), enforces the children limit and
 * encrypts the CCAvenue request; the amount shown on the page is only a preview.
 *
 * Props:
 *   _id              userId
 *   formData         children to add (full objects; `_id` for existing children)
 *   subscriptionPlan the active subscription (must contain `_id`)
 *   totalAmount      preview amount (display only)
 *   onError(msg) / onSuccess()  (onSuccess fires only after a local simulation)
 */
const AddChildPayment = ({
  _id,
  formData,
  subscriptionPlan,
  totalAmount,
  onError,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(isDevLikeHost());
  }, []);

  const fail = (msg) => {
    if (typeof onError === "function") onError(msg);
  };

  const createIntent = async () => {
    const subscriptionId = subscriptionPlan?._id || subscriptionPlan?.id;
    if (!_id) throw new Error("User ID not provided");
    if (!subscriptionId) throw new Error("No active plan found");
    const children = (formData || []).map(toChildPayload);
    if (children.length === 0) throw new Error("Select at least one child to add");

    const res = await PaymentServices.initiate({
      type: "addChild",
      subscriptionId,
      children,
    });
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || "Payment could not be started");
    }
    return { intent: res.data, subscriptionId, children };
  };

  const initiatePayment = async () => {
    setLoading(true);
    try {
      const { intent } = await createIntent();
      postToGateway(intent);
    } catch (err) {
      console.error("Add-child payment error:", err);
      fail(getApiErrorMessage(err, "Payment initiation failed"));
      setLoading(false);
    }
  };

  const simulatePaymentSuccess = async () => {
    setLoading(true);
    try {
      const { intent, subscriptionId, children } = await createIntent();
      const result = await PaymentServices.localAddChildSuccess({
        userId: _id,
        childrenData: children,
        paymentInfo: {
          orderId: intent.orderId,
          transactionId: "LOCAL_TXN",
          subscriptionId,
          paymentAmount: intent.amount,
        },
      });
      if (!result?.success) {
        throw new Error(result?.message || "Local payment simulation failed");
      }
      if (typeof onSuccess === "function") onSuccess(result);
    } catch (err) {
      fail(getApiErrorMessage(err, "Local payment simulation failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        onClick={initiatePayment}
        disabled={loading}
        className="proceedbtn"
      >
        <span>
          {loading
            ? "Processing Payment..."
            : `Make Payment${totalAmount ? ` (₹${totalAmount})` : ""}`}
        </span>
      </Button>
      {isLocalhost && (
        <Button
          variant="outlined"
          onClick={simulatePaymentSuccess}
          disabled={loading}
          sx={{ ml: 2, color: "#1976d2", borderColor: "#1976d2" }}
        >
          Simulate Payment Success (Local)
        </Button>
      )}
    </>
  );
};

export default AddChildPayment;
