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
 * AddUpcomingChildPayment
 * -----------------------
 * Adds an EXISTING child to an UPCOMING subscription. It uses the same
 * server-side payment as the normal add-child flow (`type: "addChild"`): the
 * server notices the plan has not started yet and prices each new child at
 * round(plan price / existing children), the same rule this page previews.
 *
 * Props:
 *   _id           : userId (string)
 *   subscription  : the target subscription object (must contain `_id`)
 *   childrenData  : array of child objects to add (must each contain `_id`)
 *   totalAmount   : preview amount (display only)
 *   onError(msg)  : called on failure
 *   onSuccess()   : called on local-simulation success
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
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(isDevLikeHost());
  }, []);

  const fail = (msg) => {
    if (typeof onError === "function") onError(msg);
  };

  const createIntent = async () => {
    const subscriptionId = subscription?._id;
    const children = (childrenData || []).map(toChildPayload);
    if (!_id) throw new Error("User ID not provided");
    if (!subscriptionId) throw new Error("Target subscription not found");
    if (children.length === 0) throw new Error("No child selected to add");

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
      console.error("AddUpcomingChildPayment error:", err);
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
        throw new Error(result?.message || "Local payment failed");
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
        <span>{loading ? "Processing Payment..." : `Pay ₹${totalAmount}`}</span>
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

export default AddUpcomingChildPayment;
