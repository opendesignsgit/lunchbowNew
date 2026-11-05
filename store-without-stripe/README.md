# LunchBowl customer website

Next.js (pages router) + MUI storefront for lunchbowl.co.in. Customers log in
with an OTP (next-auth credentials session); all data comes from the LunchBowl
API (`../backend`).

## Setup

```bash
cp .env.example .env.local   # then edit the values
npm install --legacy-peer-deps
npm run dev                  # http://localhost:3000
```

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the API **including `/api`** (e.g. `https://api.lunchbowl.co.in/api`). All requests in `src/services/*` are relative to it. Inlined at build time. |
| `NEXT_PUBLIC_STORE_DOMAIN` | Public URL of this site. |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | next-auth. |
| `NEXT_PUBLIC_ENABLE_TRIAL`, `NEXT_PUBLIC_SMS_ENABLED`, `NEXT_PUBLIC_FACEBOOK_PIXEL_ID`, `NEXT_PUBLIC_CLOUDINARY_*` | Optional features. |

See `.env.example` for the full list.

## Authentication

Customer API routes (`/customer/*`) require `Authorization: Bearer <token>`,
where the token is the JWT returned by `verifyOtp` and stored in the next-auth
session as `session.user.token`. `src/services/httpServices.js` adds the header
on every request: it caches the token after `UserContext` sets it, and when a
page calls the API before that it resolves the session itself (`getSession`).
A `401` clears the cached token, shows "Your session has expired, please log in
again" and signs the customer out once.

## Payments (CCAvenue)

Payments are created on the server. The website never holds the CCAvenue
merchant id, access code or working key and never decides the amount:

1. The component calls `POST /api/ccavenue/initiate` with
   `{ type: "subscription" | "renewal" | "addChild" | "holiday", source: "web", ...fields }`
   (`src/services/PaymentServices.js`).
2. The server prices the payment, stores a `PaymentIntent` and returns
   `{ gatewayUrl, encRequest, accessCode, orderId, type, amount }`.
3. The browser posts `encRequest` + `access_code` to `gatewayUrl` with a hidden
   form (`src/lib/ccavenueCheckout.js`).
4. CCAvenue calls the backend, which settles the order and redirects to
   - success: `/user/menuCalendarPage?payment=success&type=<type>&orderId=<id>`
     (holiday: `/payment/success?type=holiday&orderId=<id>`)
   - failure: `/payment/subscriptionFailed?type=<type>&orderId=<id>&reason=<failed|amount_mismatch|processing|expired>`
     (holiday: `/payment/failed?...`).

Plans chosen in the subscription / renewal step are `pending_payment` until the
payment settles; the server activates them.

### Test payments

- `NEXT_PUBLIC_DEV_RE1_PAYMENT` no longer exists on the website. Charging ₹1 on
  the gateway is a **backend** setting: `CCAV_TEST_AMOUNT_RE1=true`.
- The "Simulate Payment Success (Local)" buttons render only on localhost /
  `dev.*` hosts. They still create the intent through `/initiate` and then call
  the backend's local-success endpoints, which exist only when the backend runs
  with `ALLOW_LOCAL_PAYMENTS=true` or `CCAV_MODE=test`.

## Scripts

- `npm run dev` – development server
- `npm run build` / `npm start` – production build
- `npm run lint` – ESLint
