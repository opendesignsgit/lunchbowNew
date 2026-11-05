# Admin operations API (`/api/admin-ops`)

Backend endpoints for the admin dashboard's operations pages. Everything under
`/api/admin-ops` requires an **admin** JWT: `Authorization: Bearer <token>` from
`POST /api/admin/login` (`isAuth` + `isAdminUser`; customer tokens get `403`).

Conventions

- All responses are JSON `{ success: boolean, ... }`; errors carry `message` (and `errors[]` for validation).
- Lists are paginated with `?page=1&limit=20` (max 100) and return `{ data, page, limit, total, totalPages }`.
- Business dates are IST calendar days. Subscriptions carry `startDateKey` / `endDateKey` (`YYYY-MM-DD`) next to the raw dates; send dates as `YYYY-MM-DD`.
- Every mutation writes an `AuditLog` row and (where noted) an `admin.override` admin notification.

Code: `routes/adminOpsRoutes.js`, `controller/adminOps/*.js`, `lib/settingsStore.js`, `lib/notify/*`, `lib/audit.js`, `jobs/*`.

---

## Business settings

Settings are the merge of hard-coded defaults ← `.env` ← overrides stored in `BusinessSetting` (key `business`).
`GET /api/app-config` (public, used by the app/website) returns the same effective values minus `adminNotifyEmails` and `notificationChannels`.

### `GET /settings`

Response `data`:

| field | meaning |
| --- | --- |
| `effective` | merged config the app sees (`pricePerDayPerChild`, `planDurations{oneMonth,threeMonths,sixMonths}`, `singleChildDiscounts{…}`, `multiChildDiscounts{…}`, `multiChildThreshold`, `holidayMealPricePerChild`, `maxChildren`, `walletMaxRedeemPercent`, `mealLockDaysAhead`, `mealCutoffTime`, `renewalReminderDays[]`, `adminNotifyEmails[]`, `trialEnabled`, `trialPrice`, `tryOurMealEnabled`, `supportPhone`, `supportEmail`, `whatsappNumber`, `notificationChannels{}`) |
| `overrides` | only what the dashboard has stored |
| `defaults` | defaults + `.env` (what you get after clearing an override) |
| `schema` | list of editable keys (dotted for nested, e.g. `planDurations.oneMonth`) |
| `notificationEvents` | `[{ type, title, severity, defaultChannels[] }]` for the channel editor |
| `channels` | `["dashboard","email","push","digest"]` |
| `updatedAt`, `updatedBy` | last change |

### `PUT /settings`

Body: any subset of the editable keys, nested or dotted, plus optional `reason`. `null` clears an override.

```json
{ "pricePerDayPerChild": 250, "planDurations": { "oneMonth": 20 }, "renewalReminderDays": [7, 3, 1],
  "trialEnabled": true, "mealCutoffTime": "20:30", "adminNotifyEmails": ["ops@lunchbowl.co.in"],
  "notificationChannels": { "payment.failed": ["email", "push"] }, "supportPhone": null, "reason": "price revision" }
```

Validation: numbers/whole numbers with ranges, percentages 0–100, `HH:MM` times, email lists, known event types and channels. Unknown keys → `400 { errors: [...] }`.
Response: same as GET plus `changed: [keys]`. The cache is refreshed immediately, so the next `getPricingConfig()` / `/api/app-config` sees the change.

---

## Admin notifications

Created by `notifyAdmin()` (`lib/notify`) from user actions, jobs and admin overrides. Document:
`{ _id, type, severity: info|warning|critical, title, message, userId?, meta{}, channels[], readBy[], readAt, emailed, pushed, createdAt }`.
Event types: see `lib/notify/events.js` (`user.signup`, `registration.step`, `plan.selected`, `payment.*`, `renewal.paid`, `child.added`, `meal.updated`, `meal.deleted`, `holiday.booked`, `school.requested`, `trial.enquiry`, `enquiry.contact`, `account.deleted`, `admin.override`, `reminder.renewal.sent`, `reminder.meal.sent`, `job.error`).

Channels by severity: critical → email now + push; warning → push + daily digest; info → dashboard + daily digest. Per-type override via settings `notificationChannels`.

| method | path | query / body | response |
| --- | --- | --- | --- |
| GET | `/notifications` | `page, limit, unread=1, type, severity, userId` | paginated rows, each with `read: boolean` for the calling admin |
| GET | `/notifications/unread-count` | — | `{ count }` |
| PUT | `/notifications/:id/read` | — | `{ data }` (marks read for the calling admin) |
| PUT | `/notifications/read-all` | optional `{ type }` | `{ updated }` |
| POST | `/devices` | `{ token, platform: android|ios|web }` | `{ data }` — upsert of the FCM token for the calling admin |
| DELETE | `/devices/:token` | — | `{ deleted }` |

Push needs `firebase-admin` and `FIREBASE_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS`; otherwise it is a logged no-op. Invalid tokens are pruned automatically.

---

## Audit log

`GET /audit?targetType=&targetId=&action=&adminId=&page=` → rows
`{ adminId: { name, email }, action, targetType, targetId, before, after, reason, ip, createdAt }`.
Actions written today: `settings.update`, `subscription.update`, `subscription.create`, `wallet.adjust`, `meal.set|delete|restore`, `schoolRequest.update`, `enquiry.update`.

---

## Customers

### `GET /customers?q=&page=&limit=`

`q` matches name / phone / email on `Customer` **and** `Form.parentDetails` (father/mother names, mobile, email). Rows:

```json
{ "_id", "name", "phone", "email", "freeTrial", "createdAt", "step", "paymentStatus", "subscriptionCount",
  "walletPoints", "childrenCount", "activePlan": { "planId","startDateKey","endDateKey","status","workingDays","price","children"[] } | null,
  "upcomingPlan": … | null, "pendingPlan": … | null }
```

### `GET /customers/:userId/overview` — customer 360

```json
{ "user": {…Customer}, "form": { "step", "paymentStatus", "subscriptionCount", "parentDetails", "wallet": { "points", "history"[≤50 newest], "historyCount" } } | null,
  "children": [...], "subscriptions": [ { …sub, "startDateKey", "endDateKey", "children": [populated], "meals": { "booked", "deleted", "next7Days": [{ "date","childId","mealName","deleted" }] } } ],
  "payments": [UserPayment.payments newest first], "paymentTotals": { "count", "amount" }, "paymentIntents": [newest first, ≤50],
  "holidayPayments": [...], "smsLogCount", "notifications": [≤20 newest AdminNotifications for this user], "today": "YYYY-MM-DD" }
```

---

## Subscriptions

### `PUT /subscriptions/:id`

Body (all optional except `reason`): `startDate`, `endDate` (`YYYY-MM-DD`), `status: active|upcoming|deactivated`, `workingDays`, `children: [childId]`, `reason`.
Checks: ids valid and children belong to the customer, `endDate ≥ startDate`. Response `{ data: subscription + startDateKey/endDateKey }`. Audit + `admin.override` notification.

### `POST /subscriptions` — manual plan (orphan repair)

Body: `{ userId, planId, startDate, endDate, workingDays, price, children: [childId], status?: active|upcoming|deactivated (default active), note?, orderId?, paymentAmount?, paymentMethod? }`.
Creates the subscription, pushes it into `Form.subscriptions`; for active/upcoming also sets `paymentStatus: "Success"`, `step ≥ 4`, `subscriptionCount + 1`. Response `201 { data }`.

---

## Wallet

`POST /wallet/:userId/adjust` body `{ change: +/- number, reason, allowNegative?: boolean }`.
Adds `change` to `Form.wallet.points` (refuses to go below 0 unless `allowNegative`), pushes a history entry `{ date, change, reason, childName: "", mealName: "" }`.
Response `{ data: { points, entry } }`. Audit + notification.

---

## Meals

`POST /meals/override` body:

```json
{ "userId", "subscriptionId", "childId", "date": "YYYY-MM-DD", "action": "set|delete|restore",
  "mealName": "required for set", "creditWallet": false, "reason": "required" }
```

Works on `UserMeal` with the same India-calendar-day matching as the customer endpoints, but without the "only after today" rule.
`set` creates or replaces the meal for that day (and un-deletes it). `delete` marks it deleted; with `creditWallet` the wallet gets `+pricePerDayPerChild`. `restore` un-deletes; with `creditWallet` the same amount is debited (floored at 0).
`404` when nothing is booked for delete/restore, `409` when already in the requested state. Response `{ data: { date, childId, subscriptionId, meal: { mealName, deleted }, wallet: { points, change } | null } }`.

---

## Renewals

`GET /renewals?days=10` → active plans ending within `days` days (0–90) whose customer has **no** upcoming or pending plan:

```json
{ "data": [ { …sub, "startDateKey", "endDateKey", "children": [populated], "daysLeft", "parent": { "name", "phone", "email" },
  "walletPoints", "remindersSent": [{ "daysBefore", "channel", "sentAt" }] } ], "days", "today" }
```

---

## School requests, enquiries, SMS logs

| method | path | query / body | notes |
| --- | --- | --- | --- |
| GET | `/school-requests` | `status=pending|approved|rejected, page` | `SchoolRequest` rows |
| PUT | `/school-requests/:id` | `{ status?, note? }` | audited |
| GET | `/enquiries` | `kind=contact-us|get-in-touch|talk-nutrition|school-service|free-trial, status=new|contacted|closed, page` | `Enquiry` rows `{ kind, name, email, phone, school, message, userId?, payload, status, note, createdAt }` |
| PUT | `/enquiries/:id` | `{ status?, note? }` | audited |
| GET | `/sms-logs` | `customerId, mobile, messageType, status, page` | `SmsLog` rows with `customerId` populated (`name phone email`) |

---

## Background jobs (`/api/jobs`, not under `/admin-ops`)

Guarded by the header `x-jobs-secret: <JOBS_SECRET>` (401 on mismatch, 503 when unset). For an external cron (Vercel cron, cron-job.org) when `RUN_CRON=false`.

| method | path | response |
| --- | --- | --- |
| GET | `/api/jobs` | `{ data: [{ name, description, cron, enabled, scheduled, running, lastRun }] }` |
| POST | `/api/jobs/:name` | `{ success, name, result }` or `500 { error }`; `404` for an unknown job |

Jobs: `renewalReminders` (09:00 IST), `mealReminders` (18:00 IST, off unless `MEAL_REMINDER_ENABLED=true`), `rollSubscriptionStatuses` (00:15 IST), `adminDigest` (19:00 IST). A failing job raises a `job.error` critical notification. Reminder deliveries are recorded in `ReminderLog` so re-runs never double-send.
