import React, { useState, useEffect } from "react";
import { Box, Button, Typography, LinearProgress } from "@mui/material";
import { useRouter } from "next/router";
import PaymentServices from "@services/PaymentServices";
import { getApiErrorMessage } from "@services/httpServices";
import { postToGateway, isDevLikeHost, successPath } from "@lib/ccavenueCheckout";
import stepFour from "../../../public/profileStepImages/stepFour.png";

/**
 * Registration step 4. The plan chosen in step 3 is stored as `pending_payment`;
 * the server prices it (POST /api/ccavenue/initiate) and settlement activates it.
 */
const PaymentStep = ({ prevStep, _id }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    // Simulate button only on localhost / dev domains
    setIsLocalhost(isDevLikeHost());
  }, []);

  const initiatePayment = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await PaymentServices.initiate({ type: "subscription" });
      if (!res?.success || !res?.data) {
        throw new Error(res?.message || "Payment initiation failed");
      }
      postToGateway(res.data);
      // The browser is now navigating to CCAvenue; keep the progress bar on.
    } catch (err) {
      console.error("Payment error:", err);
      setError(getApiErrorMessage(err, "Payment initiation failed"));
      setLoading(false);
    }
  };

  const simulatePaymentSuccess = async () => {
    try {
      setLoading(true);
      setError(null);
      // Price the intent on the server first so the simulated settlement uses it.
      const res = await PaymentServices.initiate({ type: "subscription" });
      if (!res?.success || !res?.data?.orderId) {
        throw new Error(res?.message || "Could not create the payment intent");
      }
      const { orderId, type } = res.data;
      const result = await PaymentServices.localSubscriptionSuccess({
        userId: _id,
        orderId,
        transactionId: "LOCAL_TXN",
      });
      if (!result?.success) {
        throw new Error(result?.message || "Local payment simulation failed");
      }
      router.push(successPath(type || "subscription", orderId));
    } catch (err) {
      setError(getApiErrorMessage(err, "Local payment simulation failed"));
      setLoading(false);
    }
  };

  return (
    <Box
      className="subplnBoxss"
      sx={{
        display: "flex",
        alignItems: "center",
        flexDirection: { xs: "column", md: "row" },
        gap: 2,
      }}
    >
      {/* Image Side */}
      <Box
        className="spboximg"
        sx={{
          width: { xs: "100%", md: "45%" },
          backgroundImage: `url(${stepFour.src})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          backgroundPosition: "center",
          minHeight: 500,
        }}
      />
      <Box className="spboxCont" sx={{ width: { xs: "100%", md: "55%" } }}>
        {loading && <LinearProgress sx={{ mb: 3 }} />}
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}
        <div className="steptitles">
          <h3>Complete Payment</h3>
          <h6>Secure payment via CCAvenue</h6>
          <p>
            We have curated our payment system with the finest level of security ensuring a smooth and dependable experience.
          </p>
        </div>
        <Box className="subbtnrow" sx={{ display: "flex", gap: 3 }}>
          <Button className="backbtn" variant="outlined" onClick={prevStep} disabled={loading}>
            <span className="nextspan">Back</span>
          </Button>
          <Button
            className="nextbtn Proceedbtn widthautobtn"
            variant="contained"
            onClick={initiatePayment}
            disabled={loading}
            sx={{ bgcolor: "#FF6A00", "&:hover": { bgcolor: "#E55C00" } }}
          >
            <span className="nextspan">Proceed to Payment</span>
          </Button>

          {isLocalhost && (
            <Button
              className="nextbtn Proceedbtn widthautobtn"
              variant="contained"
              color="secondary"
              disabled={loading}
              onClick={simulatePaymentSuccess}
              sx={{ bgcolor: "#1976d2", "&:hover": { bgcolor: "#1565c0" } }}
            >
              Simulate Payment Success (Local)
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default PaymentStep;
