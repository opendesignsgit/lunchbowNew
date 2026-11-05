import React from "react";
import PaymentFailedView from "@components/payment/PaymentFailedView";

// Holiday-meal payments that did not go through land here:
// /payment/failed?type=holiday&orderId=<id>&reason=<failed|amount_mismatch|processing|expired>
const PaymentFailed = () => <PaymentFailedView defaultType="holiday" />;

export default PaymentFailed;
