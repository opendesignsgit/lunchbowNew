# Admin Settings (Price + Mail Control) & Orders XLSX Export — Plan

Scope: **lunch-bowl (standard) first, then port to lunchbowl-pro.**
Branch: `feature/admin-settings-and-export`

---

## 0. Key findings from the audit (read this first)

### 0.1 Prices are computed on the CLIENT and trusted by the server
`BASE_PRICE_PER_DAY` lives in the **store frontend**. The store calculates
`totalPrice = workingDays × BASE_PRICE_PER_DAY × children`, posts it, and the backend
stores it on the `Subscription` record and later bills that amount.

> **Security issue:** a user can post any `totalPrice`. Moving prices to admin settings
> should also move **price calculation to the backend** (or at minimum re-validate
> server-side). This is the single most important design decision in this work.

### 0.2 Three live price inconsistencies (bugs, independent of this feature)

| File | Line | Has | Should be |
|---|---|---|---|
| `store/src/components/addChild/AddChild.js` | 454 | `* 200` | 225 |
| `store/src/components/renew-subflow/PriceBreakdownModal.js` | 18 | default `200` | 225 |
| `backend/controller/Payment.js` | 836 | fallback `childrenData.length * 200` | 225 |

(Frontend `HolidayPayment.js` charges `* 225` but the backend fallback is `* 200`.)

---

## 1. PRICE INVENTORY — every hardcoded price

### Backend
| File | Line | Value | Purpose |
|---|---|---|---|
| `controller/customerController.js` | 1956 / 1959 | `225` | wallet credit on meal deletion |
| `controller/Payment.js` | 836 | `* 200` ⚠️ | holiday amount fallback |
| `lib/payment-invoice-pdf.js` | 11–13 | GSTIN / contact / email | invoice header (env-backed) |

### Store (frontend) — the real source of truth today
| File | Line | Value | Purpose |
|---|---|---|---|
| `profile-Step-Form/subscriptionPlanStep.js` | 29 | `BASE_PRICE_PER_DAY = 225` | new subscription |
| `profile-Step-Form/subscriptionPlanStep.js` | 93–96 | `{22:0.05, 66:0.15, 132:0.2}` / `{22:0, 66:0.05, 132:0.1}` | **discount tiers (2 sets)** |
| `renew-subflow/RenewSubscriptionPlanStep.js` | 35 | `BASE_PRICE_PER_DAY = 225` | renewal |
| `renew-subflow/RenewSubscriptionPlanStep.js` | 102–126 | discount tiers | renewal discounts |
| `renew-subflow/RenewSubscriptionPlanStep.js` | 360 | `totalPrice * 0.8` | **wallet redemption cap (80%)** |
| `renew-subflow/PriceBreakdownModal.js` | 18 | default `200` ⚠️ | breakdown display |
| `addChild/AddChild.js` | 454 | `* 200` ⚠️ | add-child pro-rata |
| `MenuCalendar/HolidayPayment.js` | 37 | `* 225` | holiday meal |
| `MenuCalendar/RightPanel.js` | 552 | `"Pay ₹225"` | UI label |
| `pages/school-kids-...-pricing.js` | 213/237/263 | `"225 per meal"` ×3 | marketing copy |
| `pages/contact-us.js` | 86 | `"₹250 per meal"` | adhoc copy |

**Plan tiers** are 22 / 66 / 132 working days (hardcoded in both plan steps).

---

## 2. MAIL INVENTORY — every hardcoded recipient / subject

### Config (already env-driven)
`backend/.env`: `SERVICE`, `HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `ADMIN_NOTIFY_EMAILS`
`lib/payment-invoice-pdf.js`: `LUNCHBOWL_EMAIL`, `LUNCHBOWL_CONTACT`, `LUNCHBOWL_GSTIN`

### Hardcoded admin recipients + subjects
| File | Line | Recipients | Subject |
|---|---|---|---|
| `adminController.js` | 615 | contactus, maniyarasanodi20, yourpersonalrd.sujatha, sujatha@nutritureclinic | New Nutrition Enquiry Received |
| `adminController.js` | 631 | (customer) | Thank you for submitting your Nutrition Form! |
| `adminController.js` | 715 | contactus, maniyarasanodi20 | New Trail Meal @ 99 Enquiry |
| `adminController.js` | 740 | (customer) | ONE BOWL, ENDLESS FRESHNESS—TRAIL MEAL INSIDE |
| `adminController.js` | 811 | contactus, maniyarasanodi20 | New General Enquiry Received |
| `adminController.js` | 827 | (customer) | Thank you for getting in touch with Lunch Bowl! |
| `adminController.js` | 868 | contactus, maniyarasanodi20 | New Contact Us Enquiry |
| `adminController.js` | 883 | (customer) | Thank you for your enquiry! |
| `adminController.js` | 945 | contactus, maniyarasanodi20 | New School Service Enquiry Received |
| `adminController.js` | 962 | (customer) | Thank you for your enquiry! |
| `adminController.js` | 100 | `req.body.verifyEmail` | Password Reset |
| `customerController.js` | ~1621 | contactus, csivarex.odi, maniyarasanodi20 | Meal Deleted by Customer – {name} |
| `customerController.js` | ~788 | (customer) | Welcome to Lunch Bowl – You're All Set! |
| `Payment.js` | 1060 / 1232 | contactus, csivarex.odi, maniyarasanodi20 | Try-Our-Meal admin notices |
| `Payment.js` | `sendSubscriptionAdminEmail` | `ADMIN_NOTIFY_EMAILS` ✅ | Subscription Renewal / New Subscription |
| `Payment.js` | `sendPaymentInvoiceEmail` | customer | Your LunchBowl Invoice – {invoice#} |
| `jobs/renewalReminder.js` | 35–43 | (commented out) | Renewal Reminder |

### Template files
`lib/email-sender/templates/`: `forget-password`, `order-to-customer`, `register`, `support-message`, `add-staff` (`.hbs` + `index.js`)

**Summary:** ~10 hardcoded recipient lists, ~17 subjects, ~17 inline HTML bodies.

---

## 3. PROPOSED DESIGN — AppSettings

### 3.1 Model — `backend/models/AppSettings.js` (singleton document)
```js
{
  pricing: {
    basePricePerDay: 225,
    holidayMealPrice: 225,
    addChildPricePerDay: 225,
    adhocMealPrice: 250,
    walletCreditOnMealDelete: 225,     // 250 in pro
    walletRedeemCapPercent: 80,
    planTiers: [22, 66, 132],
    discounts: {
      tierA: { 22: 0.05, 66: 0.15, 132: 0.2 },
      tierB: { 22: 0,    66: 0.05, 132: 0.1 }
    }
  },
  mail: {
    fromName: "Lunch Bowl",
    companyEmail: "contactus@lunchbowl.co.in",
    recipients: {
      nutrition: [...], trialMeal: [...], general: [...],
      contact: [...], school: [...], mealDelete: [...],
      subscription: [...], tryOurMeal: [...]
    },
    subjects: { /* key → subject string */ },
    enabled: { /* key → bool, to mute a mail type */ }
  },
  updatedBy, updatedAt
}
```

### 3.2 Endpoints
| Method | Route | Auth | Use |
|---|---|---|---|
| GET | `/api/settings/public` | none | store reads pricing only (cacheable) |
| GET | `/api/settings` | admin | dashtar settings page |
| PUT | `/api/settings` | admin | save |

### 3.3 Dashtar — new **Settings** page
- Route `/settings` (sidebar under Catalog), two tabs: **Pricing** / **Mail**
- Pricing: number inputs + discount tier grid + validation (>0, %0–100)
- Mail: per-event recipient chips (comma-separated), subject inputs, enable toggles
- Reuse existing `Card/CardBody/Input/Button` + `SettingServices`

### 3.4 Store — consume settings
- Add `getPublicSettings()` in `services/`; fetch in `_app` or per plan page
- Replace each constant from §1 with `settings.pricing.*`
- Fallback to current constants if fetch fails (never block checkout)

### 3.5 Backend — consume + enforce
- `deleteMeal` wallet credit ← `settings.pricing.walletCreditOnMealDelete`
- `Payment.js` holiday fallback ← `settings.pricing.holidayMealPrice`
- Mail sites ← `settings.mail.recipients[key]` / `subjects[key]`
- **Recompute/validate subscription price server-side** before saving (see §0.1)

### 3.6 Rollout order
1. Model + seed (current values) + GET/PUT endpoints
2. Dashtar Settings page (read-only → editable)
3. Backend consumers (wallet, holiday, mail)
4. Store consumers (plan steps, holiday, add-child, breakdown)
5. Server-side price validation
6. Fix the three §0.2 bugs as part of the migration
7. Port to pro (same, with `walletCreditOnMealDelete: 250`)

---

## 4. ORDERS EXPORT → XLSX

### 4.1 Current
`dashtar/src/pages/Orders.jsx` → `downloadCSV()`, **client-side**, builds a CSV string:
- optional "Dish Summary" block (dish, count) when a date filter is set
- then table: `#, Child Name, Class & Section, School, Location, Date, Food`
- exports **only the current page** (`orders` state), not the whole filtered set
- data from `OrderServices.searchOrders({ childName, date, page, limit })`

### 4.2 Problems
- CSV (not XLSX), no formatting/widths/freeze panes
- Page-limited, not filter-wide
- Single flat sheet; dish summary crammed above the table

### 4.3 Proposed — two options

**Option A (recommended): server-side XLSX**
`GET /api/orders/export?childName=&date=` → streams `.xlsx`
- Uses `exceljs` on the backend; ignores pagination (exports the full filtered set)
- Sheets: `Orders` + `Dish Summary` (+ optional `By School`)
- Styled header row, auto column widths, freeze panes, real date cells
- Pros: no row limit, consistent, reusable by cron/email

**Option B: client-side XLSX with SheetJS**
- Keep it in the browser, swap CSV→`xlsx` lib, fetch all pages first
- Faster to build, but heavy for large exports

### 4.4 Needed from you
The current format is "not what we wanted" — I need the target spec:
- Exact **columns + order + headers**
- **One sheet or multiple** (Orders / Dish Summary / per-School)?
- **Grouping/sorting** (by school? by meal? by class?)
- Totals/subtotals rows?
- Filename convention (e.g. `orders_2026-07-15.xlsx`)
- Should export respect the **date filter only**, or full range?

---

## 4A. Pricing landing page — now settings-driven, SEO intact

`store/src/pages/school-kids-lunch-subscription-service-in-chennai-pricing.js` uses
`getStaticProps` + `revalidate: 300` to fetch `/settings/public` at **build time**, so:

- prices are **pre-rendered into the HTML** → identical SEO to the old hardcoded values
- they **derive from admin Settings** → no drift from checkout
- if the API is unreachable at build, it falls back to `DEFAULT_PRICING` (build never fails)

Cards map to `planTiers[0..2]` using the **single-child** discount (what we advertise).
Derived: price, struck-through original, working days, "N per meal", "includes X% savings",
and the % OFF badges.

Still static in that page: the "Per Month / 3 months / 6 months" labels and the
sibling-discount copy ("extra 5%") — revisit if tier days change.

---

## 5. Open questions
1. Server-side price calc — in scope now, or later? (recommended: now)
2. Should **plan tiers** (22/66/132) be admin-editable, or fixed?
3. Mail **bodies** editable too, or only recipients/subjects? (bodies = much bigger scope)
4. Who can edit settings — any admin, or a specific role?
