# Payments: how settlement works and what to do when something is off

## The flow

1. **Start** — the app or website calls `POST /api/ccavenue/initiate` (logged in). The
   server prices the order, creates a `PaymentIntent` (`status: created`) with a
   snapshot of what is being bought (plan dates/children, holiday meals, children to
   add), encrypts the CCAvenue request and returns `encRequest` + `accessCode`.
   The client never sees the working key and cannot choose the amount.
2. **Pay** — the client posts the form to CCAvenue.
3. **Settle** — one of three things brings the result back, all through
   `lib/payments/settlement.js#settleOrder`:
   - CCAvenue's browser redirect to `/api/ccavenue/response` (or
     `/response/holiydayPayment`, `/response/addChildPayment`);
   - the **reconciliation job** (every 10 min) asking CCAvenue's order-status API
     about intents still `created` after 5 minutes — this is what settles UPI
     payments where the parent never came back to the browser;
   - an **admin** confirming the payment from Dashboard → Payments after checking
     the CCAvenue merchant dashboard.
4. **Apply** — the business effect (`lib/payments/apply.js`): plan activated
   (`pending_payment → active/upcoming`), wallet deducted, children added, holiday
   meal booked; invoice, SMS and admin notification sent.

Guarantees: one order is applied at most once (atomic claim on the intent); a
successful charge whose amount/user differs from the server price is recorded but
**not** applied (`amount_mismatch`, critical alert); if applying fails the intent
stays `success` with `applyError` and the admin is alerted — captured money is never
dropped.

## Intent statuses

| status | meaning | what to do |
|---|---|---|
| `created` | customer was sent to CCAvenue, no result yet | nothing for 5–30 min; after 30 min the job alerts "unreconciled" |
| `processing` | a result is being applied right now | wait |
| `success` | paid and applied | — (if `applyError` is set: Payments → **Retry apply**) |
| `failed` | gateway said Failure/Aborted/Timeout | customer can retry |
| `amount_mismatch` | charged amount or user ≠ priced order | check CCAvenue; refund or confirm manually with the real amount |
| `expired` | no result within 72 h | if the CCAvenue dashboard shows it paid: Payments → **Confirm payment** |

## Daily checks (Dashboard → Payments)

- **Needs attention** tab must be empty: mismatches and paid-but-unapplied orders.
- **Unreconciled** tab: orders older than 30 min with no result. With the status API
  enabled the job settles them automatically; without it, compare with the CCAvenue
  dashboard and use **Confirm payment** (tracking id + note required, audited).

## Environment

```
CCAV_MERCHANT_ID / CCAV_ACCESS_CODE / CCAV_WORKING_KEY   gateway credentials (server only)
CCAV_STATUS_API_ENABLED=true                             enables reconciliation lookups
CCAV_STATUS_API_URL                                      default https://api.ccavenue.com/apis/servlet/DoWebTrans
STORE_URL                                                website base for post-payment redirects
API_PUBLIC_URL                                           this API's public URL (redirect/cancel URLs)
CCAV_TEST_AMOUNT_RE1=true                                dev only: charge ₹1
ALLOW_LOCAL_PAYMENTS=true / CCAV_MODE=test               dev only: enables test-only settlement routes
CCAV_ACCEPT_LEGACY_CALLBACKS=false                       reject callbacks without an intent (after the website is on /initiate)
RECONCILE_PAYMENTS_CRON, RECONCILE_MIN_AGE_MINUTES, RECONCILE_ALERT_AFTER_MINUTES, RECONCILE_EXPIRE_HOURS
```

## Replacing the repair scripts

`script/fix-*-renewal.js` and `recreate-renewal-subscription.js` are no longer needed:
a late or missing callback is settled by the job or by **Confirm payment**, and a plan
row that was cleaned up is recreated from the intent's snapshot. Keep the scripts only
for forensic reading of past incidents.

## Testing

- `npm test` — unit tests (pricing, settlement normalisation, status mapping, redirects).
- `node test/integration/payments.int.js` — end-to-end against a local MongoDB
  (tampering, replays, late UPI reconciliation, legacy website shapes, admin actions).
