import React, { useState, useEffect } from "react";
import { Box, Button, Typography, LinearProgress } from "@mui/material";
import { useRouter } from "next/router";
import PaymentServices from "@services/PaymentServices";
import { getApiErrorMessage } from "@services/httpServices";
import { postToGateway, isDevLikeHost, successPath } from "@lib/ccavenueCheckout";
import stepFour from "../../../public/profileStepImages/stepFour.png";

/**
 * Renewal payment. The renewal plan (and the wallet points redeemed on it) was
 * saved as `pending_payment` in the plan step; the server prices it, applies the
 * stored wallet redemption and refuses stale prices / duplicate upcoming plans.
 */
const RenewPaymentStep = ({ prevStep, _id, walletUsed = 0 }) => {
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
      const res = await PaymentServices.initiate({ type: "renewal" });
      if (!res?.success || !res?.data) {
        throw new Error(res?.message || "Payment initiation failed");
      }
      postToGateway(res.data);
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
      const res = await PaymentServices.initiate({ type: "renewal" });
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
      router.push(successPath(type || "renewal", orderId));
    } catch (err) {
      setError(getApiErrorMessage(err, "Local payment simulation failed"));
      setLoading(false);
    }
  };

  return (
    <Box
      className="subplnBoxss renewcompaySec"
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
        <div className="steptitles compaySec">
          <h4>Complete Payment</h4>
          <h6><strong>Secure payment via CCAvenue</strong></h6>
          <p>We have curated our payment system with the finest <br />level of security ensuring a smooth and <br />dependable experience.</p>
          {Number(walletUsed) > 0 && (
            <p>
              <strong>{Number(walletUsed)} wallet points</strong> will be redeemed on this renewal.
            </p>
          )}
        </div>
        <Box className="subbtnrow navbtnbox" sx={{ display: "flex", gap: 3 }}>
          <Button className="backbtn" variant="outlined" onClick={prevStep} disabled={loading}>
            <span className="nextspan">Back</span>
          </Button>
          <Button
            className="nextbtn proceedbtn widthautobtn"
            variant="contained"
            onClick={initiatePayment}
            disabled={loading}
            sx={{ bgcolor: "#FF6A00", "&:hover": { bgcolor: "#E55C00" } }}
          >
            <span className="nextspan">Proceed to Payment</span>
          </Button>

          {isLocalhost && (
            <Button
              className="nextbtn proceedbtn widthautobtn"
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

export default RenewPaymentStep;
