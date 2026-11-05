import requests from "./httpServices";

/**
 * Payments are priced and encrypted on the server (POST /api/ccavenue/initiate).
 * The browser only receives the encrypted request and posts it to CCAvenue; it
 * never holds the working key, access code or the amount to charge.
 */
const PaymentServices = {
  /**
   * body: { type: "subscription" | "renewal" | "addChild" | "holiday", ...fields }
   *  - subscription / renewal: no extra fields (server prices the pending plan)
   *  - addChild: { subscriptionId, children: [full child objects, _id for existing] }
   *  - holiday:  { subscriptionId, date: "YYYY-MM-DD", children: [{ childId, mealName }] }
   * Resolves to { success, data: { gatewayUrl, encRequest, accessCode, orderId, type, amount } }
   */
  initiate: async (body) => {
    return requests.post("/ccavenue/initiate", { ...body, source: "web" });
  },

  // --- Test-only settlement endpoints (disabled on the live API) -------------
  localSubscriptionSuccess: async ({ userId, orderId, transactionId }) => {
    return requests.post("/customer/local-success", { userId, orderId, transactionId });
  },

  localAddChildSuccess: async ({ userId, childrenData, paymentInfo }) => {
    return requests.post("/ccavenue/local-success/local-add-childPayment", {
      userId,
      childrenData,
      paymentInfo,
    });
  },

  localHolidaySuccess: async (body) => {
    return requests.post("/ccavenue/local-holiday-success", body);
  },
};

export default PaymentServices;
