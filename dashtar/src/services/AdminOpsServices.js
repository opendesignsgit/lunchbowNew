import requests from "./httpService";

/** Build "?a=1&b=2" from an object, skipping empty values. */
export const toQuery = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    q.append(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
};

/**
 * /api/admin-ops — see backend/docs/admin-ops-api.md.
 * Every call needs the admin JWT, which httpService attaches from the adminInfo cookie.
 */
const AdminOpsServices = {
  // Business settings
  getSettings: () => requests.get("/admin-ops/settings"),
  updateSettings: (body) => requests.put("/admin-ops/settings", body),

  // Admin notifications
  getNotifications: (params = {}) => requests.get(`/admin-ops/notifications${toQuery(params)}`),
  getUnreadCount: () => requests.get("/admin-ops/notifications/unread-count"),
  markNotificationRead: (id) => requests.put(`/admin-ops/notifications/${id}/read`),
  markAllNotificationsRead: (body = {}) => requests.put("/admin-ops/notifications/read-all", body),
  registerDevice: (body) => requests.post("/admin-ops/devices", body),
  removeDevice: (token) => requests.delete(`/admin-ops/devices/${encodeURIComponent(token)}`),

  // Audit log
  getAudit: (params = {}) => requests.get(`/admin-ops/audit${toQuery(params)}`),

  // Customers
  searchCustomers: (params = {}) => requests.get(`/admin-ops/customers${toQuery(params)}`),
  getCustomerOverview: (userId) => requests.get(`/admin-ops/customers/${userId}/overview`),

  // Subscriptions
  updateSubscription: (id, body) => requests.put(`/admin-ops/subscriptions/${id}`, body),
  createSubscription: (body) => requests.post("/admin-ops/subscriptions", body),

  // Wallet
  adjustWallet: (userId, body) => requests.post(`/admin-ops/wallet/${userId}/adjust`, body),

  // Meals
  overrideMeal: (body) => requests.post("/admin-ops/meals/override", body),

  // Renewals
  getRenewals: (days = 10) => requests.get(`/admin-ops/renewals${toQuery({ days })}`),

  // School requests, enquiries, SMS logs
  getSchoolRequests: (params = {}) => requests.get(`/admin-ops/school-requests${toQuery(params)}`),
  updateSchoolRequest: (id, body) => requests.put(`/admin-ops/school-requests/${id}`, body),
  getEnquiries: (params = {}) => requests.get(`/admin-ops/enquiries${toQuery(params)}`),
  updateEnquiry: (id, body) => requests.put(`/admin-ops/enquiries/${id}`, body),
  getSmsLogs: (params = {}) => requests.get(`/admin-ops/sms-logs${toQuery(params)}`),
};

export default AdminOpsServices;
