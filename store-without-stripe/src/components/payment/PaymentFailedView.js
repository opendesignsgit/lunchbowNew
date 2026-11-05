import React from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import { useRouter } from "next/router";
import {
  paymentTypeLabel,
  reasonMessage,
  retryPathFor,
} from "@lib/paymentResult";

/**
 * Shared body of /payment/failed and /payment/subscriptionFailed.
 * Reads ?type=&orderId=&reason= (set by backend/lib/payments/redirects.js).
 */
const PaymentFailedView = ({ defaultType = "subscription" }) => {
  const router = useRouter();
  const { query } = router;
  const type = typeof query.type === "string" && query.type ? query.type : defaultType;
  const orderId = typeof query.orderId === "string" ? query.orderId : "";
  const reason = typeof query.reason === "string" ? query.reason : "failed";
  const processing = reason === "processing";

  const title = processing
    ? "Payment Being Confirmed"
    : reason === "amount_mismatch"
      ? "Payment Needs Review"
      : "Payment Failed";

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      textAlign="center"
      px={2}
    >
      {processing ? (
        <HourglassTopIcon sx={{ fontSize: 80, color: "#FF6A00", mb: 2 }} />
      ) : (
        <ErrorOutlineIcon sx={{ fontSize: 80, color: "red", mb: 2 }} />
      )}
      <Typography variant="h4" gutterBottom>
        {title}
      </Typography>
      <Typography sx={{ mb: 1, maxWidth: 560 }}>
        {reasonMessage(reason)}
      </Typography>
      <Typography sx={{ mb: 1, color: "#666", textTransform: "capitalize" }}>
        {paymentTypeLabel(type)}
      </Typography>
      {orderId && (
        <Typography sx={{ mb: 3, color: "#666" }}>
          Order ID: <strong>{orderId}</strong>
          <br />
          <small>Please quote this ID if you contact support.</small>
        </Typography>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {processing ? (
          <Button
            variant="contained"
            sx={{ bgcolor: "#FF6A00", "&:hover": { bgcolor: "#E55C00" } }}
            onClick={() => router.reload()}
          >
            Refresh
          </Button>
        ) : (
          <Button
            variant="contained"
            color="error"
            onClick={() => router.push(retryPathFor(type))}
          >
            Try again
          </Button>
        )}
        <Button
          variant="outlined"
          onClick={() => router.push("/user/menuCalendarPage")}
        >
          Menu Calendar
        </Button>
        <Button variant="text" onClick={() => router.push("/contact-us")}>
          Contact support
        </Button>
      </Stack>
    </Box>
  );
};

export default PaymentFailedView;
