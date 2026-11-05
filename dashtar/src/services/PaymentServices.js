import requests from "./httpService";
import { toQuery } from "./AdminOpsServices";

/**
 * /api/admin-ops/payments — backend/controller/adminPaymentsController.js.
 * status: created | processing | success | failed | amount_mismatch | expired | unreconciled | attention
 */
const PaymentServices = {
  list: (params = {}) => requests.get(`/admin-ops/payments${toQuery(params)}`),
  summary: () => requests.get("/admin-ops/payments/summary"),
  get: (orderId) => requests.get(`/admin-ops/payments/${encodeURIComponent(orderId)}`),
  reconcile: (orderId) => requests.post(`/admin-ops/payments/${encodeURIComponent(orderId)}/reconcile`),
  confirm: (orderId, body) => requests.post(`/admin-ops/payments/${encodeURIComponent(orderId)}/confirm`, body),
  retryApply: (orderId) => requests.post(`/admin-ops/payments/${encodeURIComponent(orderId)}/retry-apply`),
  runReconciliation: () => requests.post("/admin-ops/payments/run-reconciliation"),
  forCustomer: (userId) => requests.get(`/admin-ops/payments/customer/${userId}`),
};

export default PaymentServices;
