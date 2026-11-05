/**
 * Shared copy for the payment result pages. The backend redirects to
 *   success: /user/menuCalendarPage?payment=success&type=<type>&orderId=<id>
 *            /payment/success?type=holiday&orderId=<id>
 *   failure: /payment/subscriptionFailed?type=<type>&orderId=<id>&reason=<reason>
 *            /payment/failed?type=holiday&orderId=<id>&reason=<reason>
 * (see backend/lib/payments/redirects.js).
 */

export const PAYMENT_TYPE_LABELS = {
  subscription: "subscription",
  renewal: "subscription renewal",
  addChild: "add-child payment",
  holiday: "holiday meal payment",
};

export const RETRY_PATHS = {
  subscription: "/user/profile-Step-Form",
  renewal: "/user/renew-subscription",
  addChild: "/user/add-child",
  holiday: "/user/menuCalendarPage",
};

export const paymentTypeLabel = (type) =>
  PAYMENT_TYPE_LABELS[type] || "payment";

export const retryPathFor = (type) =>
  RETRY_PATHS[type] || "/user/userDashBoard";

export const reasonMessage = (reason) => {
  switch (reason) {
    case "amount_mismatch":
      return "The amount paid did not match the amount due. Our team has been alerted and nothing was charged to your plan.";
    case "processing":
      return "Your payment is still being confirmed. Please refresh this page in a minute before trying again.";
    case "expired":
      return "This payment request expired before it was completed. Please start again.";
    case "failed":
    default:
      return "The payment was not completed or was cancelled. No money was taken from you.";
  }
};

export const successMessage = (type) => {
  switch (type) {
    case "renewal":
      return "Your subscription has been renewed. Pick your meals for the new plan!";
    case "addChild":
      return "Payment received. Your child has been added to the plan.";
    case "holiday":
      return "Your holiday meal payment is successful. Enjoy your requested meal bowl!";
    case "subscription":
    default:
      return "Payment successful. Your subscription is now active!";
  }
};
