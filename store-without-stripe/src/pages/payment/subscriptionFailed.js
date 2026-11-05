import React from "react";
import PaymentFailedView from "@components/payment/PaymentFailedView";

// Subscription / renewal / add-child payments that did not go through land here:
// /payment/subscriptionFailed?type=<type>&orderId=<id>&reason=<failed|amount_mismatch|processing|expired>
const SubscriptionPaymentFailed = () => (
  <PaymentFailedView defaultType="subscription" />
);

export default SubscriptionPaymentFailed;
