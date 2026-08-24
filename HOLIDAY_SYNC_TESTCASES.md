# Holiday ↔ Subscription Sync — Test Cases (Lunchbowl STANDARD)

Branch: `feature/holiday-subscription-sync` (Lunchbowl **standard / lunch-bowl**)

## What changed

**Backend**
- `models/subscriptionModel.js` — new `holidayAdjustments[]` (audit + idempotency).
- `services/holidaySync.js` — **child-aware** core logic: `planHolidayAdd` (dry-run preview), `applyHolidayAdd` (extend + pull-to-end per child), `planHolidayDelete` (forward-only).
- `controller/adminController.js` — `addHoliday` / `updateHoliday` now apply the sync; new `previewHolidayImpact`.
- `routes/holidayRoutes.js` — new `POST /holidays/preview-impact`.

**Admin (dashtar)**
- `components/drawer/HolidayModal.jsx` — Preview-impact → Confirm flow.
- `services/HolidayServices.js` — `previewImpact`.

> Note: standard has **no try-our-meal calendar** (its ₹99 trial is a lead form with no date picker), so there is **no** `applyToTryMeal` flag or try-meal block here — that's Pro-only.

## Key difference vs Pro
Standard `UserMeal` nests meals under each child:
`plans[].children[].meals[]` (Pro is flat `plans[].meals[]`).
So when a subscription is extended, the meal on the holiday is pulled to the new end day **for every child** in that plan.

## Business rules being verified
- Add holiday on a **working day** → each active/upcoming subscription spanning it is **extended by one working day**, and each child's meal on that day is **pulled to the new end day** (dish carried over). Only future, undelivered meals are touched.
- Delete holiday → **forward-only**: existing subscriptions unchanged.
- **Idempotent** — re-adding/applying the same holiday never double-extends.
- Price / wallet / meal count never change — the customer just finishes one working day later.

---

## A. Holiday → Subscription sync

| # | Scenario | Setup | Action | Expected outcome |
|---|----------|-------|--------|------------------|
| A1 | Add holiday on a working day, single child has a meal | Active sub (1 child), endDate = Fri, child's meal "Lemon Rice" booked on the mid-week holiday D | Preview, then Confirm | Preview lists 1 sub. After confirm: endDate → next working day; child's meal on D removed and re-created on the new end day with "Lemon Rice"; 1 `holidayAdjustments` entry. |
| A2 | **Multiple children** each have a meal on D | Sub with 2 children, both booked on D | Confirm add | **Both** children's meals on D are moved to the new end day (each keeps its own dish). endDate extended once. |
| A3 | Add holiday, no meal booked on D yet | Sub spanning D, no meals on D | Confirm add | endDate extended by one working day; no meal move. |
| A4 | Add holiday on a **weekend** | Any subs | Preview a Sat/Sun | "weekend — no delivery day lost", affectedCount 0; holiday created, no sub changed. |
| A5 | Add holiday in the **past** | Subs exist | Preview yesterday | "date is in the past", affectedCount 0; no sub changed. |
| A6 | Holiday **outside** a sub's range | Sub ends before D | Add D | Sub not affected. |
| A7 | Extension **skips weekends** | endDate = Fri; add mid-week holiday | Confirm | New endDate = **Monday** (not Saturday). |
| A8 | Extension **skips another holiday** | endDate = Mon, Tue already a holiday; add mid-week holiday | Confirm | New endDate = **Wed**. |
| A9 | **Idempotency** | After A1 | Re-apply same D | No further change; still 1 adjustment entry; endDate unchanged. |
| A10 | Multiple subscriptions | 3 active subs spanning D | Confirm add | All 3 extended; preview shows 3 rows. |
| A11 | Deactivated subscription | status = deactivated spanning D | Add D | Not affected (only active/upcoming). |
| A12 | Moved meal is **not** flagged cancelled | After A1 | Open kitchen Orders for D | Moved meal does **not** show "CANCELLED — DO NOT DISPATCH" (spliced out, not soft-deleted). It appears on the new end day. |
| A13 | Only some children booked on D | Sub with 2 children, only 1 booked on D | Confirm | The booked child's meal moves; the other child just gets the extended endDate (nothing to move). |

## B. Delete / Update holiday

| # | Scenario | Action | Expected outcome |
|---|----------|--------|------------------|
| B1 | Delete a holiday | Delete D | Holiday removed. Existing subscriptions **unchanged** (forward-only). New subscriptions treat D as a normal working day. |
| B2 | Preview a delete | previewImpact `{date, action:"delete"}` | `forwardOnly:true`, affectedCount 0, explanatory note. |
| B3 | Update **name only** | Edit name, same date | Name saved; no subscription change. |
| B4 | Update **date** (move it) | Change D1 → D2 | D1 forward-only (no rollback); D2 behaves like a fresh add → subs spanning D2 extended. |

## C. Preview endpoint (admin)

| # | Request | Expected response |
|---|---------|-------------------|
| C1 | `POST /holidays/preview-impact {date:"<working day within active subs>", action:"add"}` | `data.affectedCount > 0`; each change has `customerName, phone, endDateBefore, endDateAfter, mealsMoved[]` (one entry per child booked on D). |
| C2 | `POST /holidays/preview-impact {date:"<weekend>", action:"add"}` | `data.weekend = true`, affectedCount 0. |
| C3 | `POST /holidays/preview-impact {date, action:"delete"}` | `data.forwardOnly = true`, affectedCount 0, note present. |
| C4 | Missing `date` | 400 `{ success:false, message:"date is required" }`. |

## D. Safety / regression

| # | Check | Expected |
|---|-------|----------|
| D1 | Price / wallet untouched | Adding a holiday never changes price, paymentAmount, or wallet. |
| D2 | Legacy/invalid docs don't crash | Subscriptions saved with `validateModifiedOnly:true`. |
| D3 | Add-holiday still works with no impact | Holiday created even when `subscriptionsUpdated = 0`. |
| D4 | New subscriptions already correct | Newly-created subs (after the holiday exists) skip the holiday at creation as before — no double handling. |

---

## Suggested manual test flow (dev DB)

1. Seed an active subscription with **2 children**, meals booked Mon–Fri next week.
2. Admin → Holidays → Add → pick a **Wednesday** next week → **Preview impact**.
   - Expect: the sub appears with `endDate: Fri → next Mon` and "2 meals → next Mon".
3. **Confirm & extend**. Re-open the subscription/UserMeal: endDate is next Mon; each child's Wednesday dish now sits on next Mon.
4. Re-add / re-apply the same Wednesday → nothing changes (idempotent).
5. Delete the holiday → subscription keeps its extended endDate (forward-only).
