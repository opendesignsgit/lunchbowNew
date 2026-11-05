import axios from "axios";
import Cookies from "js-cookie";

// Configured API base (".../api"). Everything in the dashboard must go through this
// instance (or `authFetch` below) so the admin JWT is always attached.
export const API_BASE_URL = (
  import.meta.env.VITE_APP_API_BASE_URL || "https://api.lunchbowl.co.in/api"
).replace(/\/+$/, "");

// Host without the "/api" suffix, for static files served by the backend (uploaded images).
export const API_HOST = API_BASE_URL.replace(/\/api$/, "");

/** Absolute URL for a backend-hosted file path such as "uploads/x.png" or "/uploads/x.png". */
export const apiFileUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) return path;
  return `${API_HOST}/${String(path).replace(/^\/+/, "")}`;
};

/** Authorization header value from the adminInfo cookie (null when logged out). */
export const getAuthHeader = () => {
  try {
    const raw = Cookies.get("adminInfo");
    const adminInfo = raw ? JSON.parse(raw) : null;
    return adminInfo?.token ? `Bearer ${adminInfo.token}` : null;
  } catch (err) {
    return null;
  }
};

/**
 * fetch() against the API with the admin token, for non-JSON responses (CSV downloads).
 * `path` is relative to API_BASE_URL, e.g. "/orders/kitchen-sheet?date=2025-01-01&format=csv".
 */
export const authFetch = (path, options = {}) => {
  const auth = getAuthHeader();
  const headers = { ...(options.headers || {}) };
  if (auth) headers.authorization = auth;
  return fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, { ...options, headers });
};

/** Trigger a browser download of a Blob. */
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const instance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 50000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// Add a request interceptor
instance.interceptors.request.use(function (config) {
  // Do something before request is sent
  let adminInfo;
  if (Cookies.get("adminInfo")) {
    adminInfo = JSON.parse(Cookies.get("adminInfo"));
  }

  let company;

  if (Cookies.get("company")) {
    company = Cookies.get("company");
  }

  // console.log('Admin Http Services Cookie Read : ' + company);
  // let companyName = JSON.stringify(company);

  return {
    ...config,
    headers: {
      authorization: adminInfo ? `Bearer ${adminInfo.token}` : null,
      company: company ? company : null,
    },
  };
});

const responseBody = (response) => response.data;

const requests = {
  get: (url, body, headers) =>
    instance.get(url, body, headers).then(responseBody),

  post: (url, body) => instance.post(url, body).then(responseBody),

  put: (url, body, headers) =>
    instance.put(url, body, headers).then(responseBody),

  patch: (url, body) => instance.patch(url, body).then(responseBody),

  delete: (url, body) => instance.delete(url, body).then(responseBody),
};

export default requests;
