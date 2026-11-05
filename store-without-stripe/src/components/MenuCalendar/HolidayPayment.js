import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  LinearProgress,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import PaymentServices from "@services/PaymentServices";
import { getApiErrorMessage } from "@services/httpServices";
import { postToGateway, isDevLikeHost, successPath } from "@lib/ccavenueCheckout";

// Display only; the server prices the holiday meal (lib/pricing holidayMealPricePerChild).
const HOLIDAY_MEAL_PRICE = 225;

const mealNameOf = (child) => {
  if (!child) return "";
  if (typeof child.dish === "string") return child.dish;
  return child.dish?.mealName || child.mealName || "";
};

/**
 * Confirms and starts a holiday-meal payment. The server validates the date,
 * the plan and the children, prices the meals and encrypts the CCAvenue request.
 *
 * childrenData: [{ childId, dish: string | { mealName } , mealDate }]
 * currentPlanId: the subscription (_id) the children belong to
 */
const HolidayPayment = ({
  open,
  onClose,
  selectedDate,
  childrenData = [],
  currentPlanId,
  onSuccess,
}) => {
  const { data: session } = useSession();
  const router = useRouter();
  const _id = session?.user?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    setIsLocalhost(isDevLikeHost());
  }, []);

  const children = childrenData.map((child) => ({
    childId: child.childId,
    mealName: mealNameOf(child),
  }));
  const totalAmount = childrenData.length * HOLIDAY_MEAL_PRICE;

  const createIntent = async () => {
    if (!_id) throw new Error("User not logged in. Please login to continue.");
    if (!currentPlanId) throw new Error("No subscription plan selected.");
    if (children.some((c) => !c.mealName)) throw new Error("Select a dish first.");

    const res = await PaymentServices.initiate({
      type: "holiday",
      subscriptionId: currentPlanId,
      date: selectedDate,
      children,
    });
    if (!res?.success || !res?.data) {
      throw new Error(res?.message || "Payment could not be started.");
    }
    return res.data;
  };

  const initiatePayment = async () => {
    try {
      setLoading(true);
      setError("");
      const intent = await createIntent();
      postToGateway(intent);
    } catch (err) {
      console.error("Holiday payment error:", err);
      setError(getApiErrorMessage(err, "Payment failed. Please try again."));
      setLoading(false);
    }
  };

  const simulatePaymentSuccess = async () => {
    try {
      setLoading(true);
      setError("");
      const intent = await createIntent();
      const result = await PaymentServices.localHolidaySuccess({
        userId: _id,
        orderId: intent.orderId,
        transactionId: "LOCAL_TXN",
        childrenData: children,
        selectedDate,
        planId: currentPlanId,
      });
      if (!result?.success) {
        throw new Error(result?.message || "Local payment simulation failed");
      }
      if (typeof onSuccess === "function") onSuccess(result);
      router.push(successPath("holiday", intent.orderId));
    } catch (err) {
      setError(getApiErrorMessage(err, "Local payment simulation failed"));
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      className="holidaypaysec"
    >
      <DialogTitle>Confirm Holiday Payment</DialogTitle>
      <DialogContent dividers>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        <Typography gutterBottom>
          You&apos;re booking <b>{childrenData.length}</b> meal
          {childrenData.length > 1 ? "s" : ""} for <b>{selectedDate}</b>.
        </Typography>
        <Typography fontWeight="bold" sx={{ mb: 1 }}>
          Total: ₹{totalAmount}
        </Typography>
        <Typography fontSize="0.8rem" color="text.secondary">
          Secure payment via CCAvenue.
        </Typography>
        {error && (
          <Typography color="error" fontSize="0.85rem" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        {isLocalhost && (
          <Button
            variant="outlined"
            onClick={simulatePaymentSuccess}
            disabled={loading}
            sx={{ color: "#1976d2", borderColor: "#1976d2" }}
          >
            Simulate Payment Success (Local)
          </Button>
        )}
        <Button
          variant="contained"
          onClick={initiatePayment}
          sx={{ bgcolor: "#f97316", "&:hover": { bgcolor: "#ea620a" } }}
          disabled={loading}
        >
          Pay ₹{totalAmount}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HolidayPayment;
