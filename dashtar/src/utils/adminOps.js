import dayjs from "dayjs";

/** "DD MMM YYYY" (accepts Date, ISO string or "YYYY-MM-DD"). */
export const fmtDate = (d) => (d ? dayjs(d).format("DD MMM YYYY") : "-");

/** "DD MMM YYYY, HH:mm" */
export const fmtDateTime = (d) => (d ? dayjs(d).format("DD MMM YYYY, HH:mm") : "-");

/** Today's date as "YYYY-MM-DD" (browser local). */
export const todayKey = () => dayjs().format("YYYY-MM-DD");

/** Add n days to a "YYYY-MM-DD" key. */
export const addDays = (key, n) => dayjs(key).add(n, "day").format("YYYY-MM-DD");

/** Rupees with grouping, no decimals unless needed. */
export const inr = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

/** Human-readable message from an axios error or a thrown Error. */
export const errMessage = (err, fallback = "Something went wrong") => {
  const data = err?.response?.data;
  if (data) {
    if (Array.isArray(data.errors) && data.errors.length) return data.errors.join("; ");
    if (data.message) return data.message;
  }
  return err?.message || fallback;
};

/** Windmill Badge `type` for a payment intent status. */
export const paymentBadgeType = (status) => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
    case "amount_mismatch":
      return "danger";
    case "expired":
      return "neutral";
    case "processing":
      return "primary";
    case "created":
    default:
      return "warning";
  }
};

/** Windmill Badge `type` for a subscription status. */
export const subscriptionBadgeType = (status) => {
  switch (status) {
    case "active":
      return "success";
    case "upcoming":
      return "primary";
    case "pending_payment":
      return "warning";
    case "deactivated":
    default:
      return "neutral";
  }
};

/** Windmill Badge `type` for a notification severity (critical red, warning amber, info grey). */
export const severityBadgeType = (severity) => {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
};

/** Left-border/background classes for a notification row by severity. */
export const severityRowClass = (severity) => {
  switch (severity) {
    case "critical":
      return "border-l-4 border-red-500";
    case "warning":
      return "border-l-4 border-amber-400";
    default:
      return "border-l-4 border-gray-300 dark:border-gray-600";
  }
};

/**
 * Where a notification should take the admin.
 * payment.* → /payments?q=<orderId>; anything tied to a customer → /customers/:userId.
 */
export const notificationLink = (n) => {
  if (!n) return null;
  const type = n.type || "";
  const meta = n.meta || {};
  if (type.startsWith("payment.") || type === "renewal.paid") {
    const orderId = meta.orderId || meta.order_id;
    if (orderId) return `/payments?q=${encodeURIComponent(orderId)}`;
    if (n.userId) return `/customers/${n.userId}`;
    return "/payments";
  }
  if (type === "school.requested") return "/requests?tab=schools";
  if (type === "trial.enquiry" || type === "enquiry.contact") return "/requests?tab=enquiries";
  if (type === "job.error") return "/notifications?severity=critical";
  const userId = n.userId || meta.userId;
  if (userId) return `/customers/${typeof userId === "object" ? userId._id : userId}`;
  return "/notifications";
};

/** Label for a registration step. */
export const stepLabel = (step) => {
  switch (Number(step)) {
    case 1:
      return "1 · Parent details";
    case 2:
      return "2 · Children";
    case 3:
      return "3 · Plan";
    case 4:
      return "4 · Paid";
    default:
      return step == null ? "-" : String(step);
  }
};

export const fullName = (first, last) => [first, last].filter(Boolean).join(" ").trim();

export const childName = (child) => (child ? fullName(child.childFirstName, child.childLastName) : "");
