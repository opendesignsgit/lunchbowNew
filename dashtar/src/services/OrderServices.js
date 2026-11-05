import requests, { authFetch, saveBlob } from "./httpService";
import { toQuery } from "./AdminOpsServices";

const OrderServices = {
  getAllOrders: async ({
    body,
    headers,
    customerName,
    status,
    page = 1,
    limit = 8,
    day,
    // source,
    method,
    startDate,
    endDate,
    // download = "",
  }) => {
    const searchName = customerName !== null ? customerName : "";
    const searchStatus = status !== null ? status : "";
    const searchDay = day !== null ? day : "";
    // const searchSource = source !== null ? source : "";
    const searchMethod = method !== null ? method : "";
    const startD = startDate !== null ? startDate : "";
    const endD = endDate !== null ? endDate : "";

    return requests.get(
      `/orders?customerName=${searchName}&status=${searchStatus}&day=${searchDay}&page=${page}&limit=${limit}&startDate=${startD}&endDate=${endD}&method=${searchMethod}`,
      body,
      headers
    );
  },

  getAllFoodOrders: async ({ page = 1, limit = 10, headers } = {}) => {
    return requests.get(
      `/orders/get-all/food-order?page=${page}&limit=${limit}`,
      null,
      headers
    );
  },

  searchOrders: async ({
    childName = "",
    date = "",
    school = "",
    lunchTime = "",
    location = "",
    page = 1,
    limit = 10,
    headers,
  } = {}) => {
    // Build query string only with supplied params
    const params = new URLSearchParams();
    params.append("page", page);
    params.append("limit", limit);
    if (childName) params.append("childName", childName);
    if (date) params.append("date", date);
    if (school) params.append("school", school);
    if (lunchTime) params.append("lunchTime", lunchTime);
    if (location) params.append("location", location);

    return requests.get(`/orders/search?${params.toString()}`, null, headers);
  },

  /**
   * Kitchen / dispatch sheet for one day, grouped school → lunch slot.
   * GET /orders/kitchen-sheet?date=YYYY-MM-DD&school=&lunchTime=
   * → { date, total, cancelled, dishSummary[], schools[{ school, total, cancelled, dishSummary, slots[{ lunchTime, rows, total, cancelled, dishSummary }] }] }
   */
  getKitchenSheet: async ({ date, school = "", lunchTime = "" } = {}) => {
    return requests.get(`/orders/kitchen-sheet${toQuery({ date, school, lunchTime })}`);
  },

  /** Server-side CSV of every row for the date (not just the current page). */
  downloadKitchenSheetCsv: async ({ date, school = "", lunchTime = "" } = {}) => {
    const res = await authFetch(`/orders/kitchen-sheet${toQuery({ date, school, lunchTime, format: "csv" })}`);
    if (!res.ok) {
      let message = `Download failed (${res.status})`;
      try {
        const body = await res.json();
        message = body?.message || message;
      } catch (err) {
        // not JSON
      }
      throw new Error(message);
    }
    const text = await res.text();
    // BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
    saveBlob(blob, `kitchen-${date || "today"}${school ? `-${school}` : ""}.csv`);
  },

  /** Subscription Table page (formerly called with bare axios). */
  getUserSubscriptions: async ({ page = 1, limit = 10 } = {}) => {
    return requests.get(`/orders/get-All/user-Subscription${toQuery({ page, limit })}`);
  },

  searchUserSubscriptions: async ({ page = 1, limit = 10, fatherName = "", mobile = "", email = "" } = {}) => {
    return requests.get(
      `/orders/get-All/user-Subscription/search${toQuery({ page, limit, fatherName, mobile, email })}`
    );
  },

  getAllOrdersTwo: async ({ invoice, body, headers }) => {
    const searchInvoice = invoice !== null ? invoice : "";
    return requests.get(`/orders/all?invoice=${searchInvoice}`, body, headers);
  },

  getRecentOrders: async ({
    page = 1,
    limit = 8,
    startDate = "1:00",
    endDate = "23:59",
  }) => {
    return requests.get(
      `/orders/recent?page=${page}&limit=${limit}&startDate=${startDate}&endDate=${endDate}`
    );
  },

  getOrderCustomer: async (id, body) => {
    return requests.get(`/orders/customer/${id}`, body);
  },

  getOrderById: async (id, body) => {
    return requests.get(`/orders/${id}`, body);
  },

  updateOrder: async (id, body, headers) => {
    return requests.put(`/orders/${id}`, body, headers);
  },

  deleteOrder: async (id) => {
    return requests.delete(`/orders/${id}`);
  },

  getDashboardOrdersData: async ({
    page = 1,
    limit = 8,
    endDate = "23:59",
  }) => {
    return requests.get(
      `/orders/dashboard?page=${page}&limit=${limit}&endDate=${endDate}`
    );
  },

  getDashboardAmount: async () => {
    return requests.get("/orders/dashboard-amount");
  },

  getDashboardCount: async () => {
    return requests.get("/orders/dashboard-count");
  },

  getDashboardRecentOrder: async ({ page = 1, limit = 8 }) => {
    return requests.get(
      `/orders/dashboard-recent-order?page=${page}&limit=${limit}`
    );
  },

  getBestSellerProductChart: async () => {
    return requests.get("/orders/best-seller/chart");
  },

  //for sending email invoice to customer
  sendEmailInvoiceToCustomer: async (body) => {
    return requests.post("/order/customer/invoice", body);
  },
};

export default OrderServices;
