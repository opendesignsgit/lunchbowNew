import axios from "axios";
import { getSession, signOut } from "next-auth/react";
import { toast } from "react-toastify";

const instance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  timeout: 50000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// ---------------------------------------------------------------------------
// Customer auth token
//
// Every customer API route needs `Authorization: Bearer <token>` (the JWT the
// backend returns from verifyOtp, kept in the next-auth session as
// session.user.token). UserContext calls setToken() once the session resolves,
// but pages that call the API from their own effects can run before that, so
// the request interceptor below resolves the session itself when no token is
// cached yet. The token is cached in module scope and cleared on sign-out.
// ---------------------------------------------------------------------------
let cachedToken = null;
let sessionLookup = null; // in-flight getSession() promise (de-duplicates calls)
let lastSessionMissAt = 0; // avoid hammering /api/auth/session while logged out
const SESSION_MISS_TTL_MS = 3000;

const isBrowser = () => typeof window !== "undefined";

export const setToken = (token) => {
  if (token) {
    cachedToken = token;
    instance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    cachedToken = null;
    lastSessionMissAt = 0;
    delete instance.defaults.headers.common["Authorization"];
  }
};

export const clearToken = () => setToken(null);

const resolveToken = async () => {
  if (cachedToken) return cachedToken;
  if (!isBrowser()) return null; // SSR / API routes have no browser session
  if (Date.now() - lastSessionMissAt < SESSION_MISS_TTL_MS) return null;

  if (!sessionLookup) {
    sessionLookup = getSession()
      .then((session) => {
        const token = session?.user?.token || null;
        if (token) setToken(token);
        else lastSessionMissAt = Date.now();
        return token;
      })
      .catch(() => {
        lastSessionMissAt = Date.now();
        return null;
      })
      .finally(() => {
        sessionLookup = null;
      });
  }
  return sessionLookup;
};

instance.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  const hasAuth =
    config.headers.Authorization || config.headers.authorization;
  if (!hasAuth) {
    const token = await resolveToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Expired / invalid token: clear the cache and sign the customer out once.
// ---------------------------------------------------------------------------
let signingOut = false;

const handleUnauthorized = async (error) => {
  const sentAuth = !!error?.config?.headers?.Authorization;
  const hadSession = !!cachedToken || sentAuth;
  clearToken();

  if (!isBrowser() || !hadSession || signingOut) return;
  signingOut = true;
  setTimeout(() => {
    signingOut = false;
  }, 10000);

  try {
    toast.error("Your session has expired, please log in again", {
      position: "top-center",
      autoClose: 4000,
    });
  } catch (e) {
    // toast container may not be mounted; the redirect below still happens
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {
    // ignore storage errors (private mode etc.)
  }
  await signOut({ callbackUrl: "/" });
};

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await handleUnauthorized(error);
    }
    return Promise.reject(error);
  }
);

const responseBody = (response) => response.data;

const requests = {
  get: (url, body) => instance.get(url, body).then(responseBody),
  post: (url, body, headers) =>
    instance.post(url, body, headers).then(responseBody),
  put: (url, body) => instance.put(url, body).then(responseBody),
  delete: (url, body) => instance.delete(url, body).then(responseBody),
};

/** Human readable message from an axios/API error (`{ success:false, message }`). */
export const getApiErrorMessage = (error, fallback = "Something went wrong") =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

export default requests;
