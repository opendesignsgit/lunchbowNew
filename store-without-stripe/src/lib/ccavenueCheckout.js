/**
 * Browser side of the CCAvenue checkout.
 *
 * The server (POST /api/ccavenue/initiate) prices the payment, encrypts the
 * request with the working key and returns { gatewayUrl, encRequest, accessCode,
 * orderId, type, amount }. All the browser does is post that to the gateway.
 */

/** Posts the server-built request to CCAvenue via a hidden form (full page navigation). */
export const postToGateway = ({ gatewayUrl, encRequest, accessCode }) => {
  if (!gatewayUrl || !encRequest || !accessCode) {
    throw new Error("Payment could not be started. Please try again.");
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = gatewayUrl;
  form.style.display = "none";

  const addInput = (name, value) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  addInput("encRequest", encRequest);
  addInput("access_code", accessCode);

  document.body.appendChild(form);
  form.submit();
};

/** True on localhost / dev hosts, where the "Simulate Payment Success" buttons may render. */
export const isDevLikeHost = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("dev.") ||
    host.includes("dev-")
  );
};

/** Only the fields the backend's child schema knows about (keeps _id for existing children). */
export const toChildPayload = (c) => {
  const child = {
    childFirstName: c.childFirstName,
    childLastName: c.childLastName,
    dob: c.dob && typeof c.dob === "string" ? c.dob.slice(0, 10) : c.dob || "",
    lunchTime: c.lunchTime,
    school: c.school,
    location: c.location,
    childClass: c.childClass,
    section: c.section,
    allergies: c.allergies || "",
  };
  if (c._id) child._id = c._id;
  return child;
};

/** Where the website lands after a successful web checkout (mirrors backend/lib/payments/redirects.js). */
export const successPath = (type, orderId) => {
  const q = `type=${encodeURIComponent(type || "")}&orderId=${encodeURIComponent(orderId || "")}`;
  if (type === "holiday") return `/payment/success?${q}`;
  return `/user/menuCalendarPage?payment=success&${q}`;
};
