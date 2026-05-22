# Meal Price Update Guide

This document explains:

1. **Where meal price should be updated**
2. **Which files control meal price flow**
3. **What to change in each file**

`<repo_root>` means the absolute path of your local clone root.  
Use this as a prefix for all absolute paths below.

---

## 1) Where to update meal price (primary location)

The primary update point for meal (dish) price is the admin dish popup form:

- **`<repo_root>/dashtar/src/components/drawer/AddDishPopup.jsx`**
- **Repo-relative:** `dashtar/src/components/drawer/AddDishPopup.jsx`

This file is used when admin adds/edits a dish from the Menu/Products page.  
If price fields are not present here, users cannot update meal price from UI.

---

## 2) End-to-end files involved in meal price updates

Meal price changes should flow across frontend form -> API service -> backend controller -> DB schema -> list display.

### A. Admin form (input source)

- **File:** `dashtar/src/components/drawer/AddDishPopup.jsx`
- **Role:** Collects dish data before submit.
- **Required updates for price support:**
  - Add `price` (and optional `originalPrice`) in `initialState`
  - Add price fields in edit preload (`setForm` inside `useEffect`)
  - Add input controls in form UI (`type="number"`)
  - Append price fields to `FormData` in `handleSubmit`

### B. Frontend API layer

- **File:** `dashtar/src/services/ProductServices.js`
- **Role:** Sends dish create/update requests.
- **Required updates:**
  - Ensure `addDish(formData)` and `updateDish(id, formData)` receive price fields from popup payload
  - No route changes needed if existing endpoints are used

### C. Backend routes (already available)

- **File:** `backend/routes/productRoutes.js`
- **Role:** Route mapping for dish APIs.
- **Relevant endpoints:**
  - `POST /products/add-dish`
  - `PUT /products/update-dish/:id`
  - `GET /products/get-all-menu`

### D. Backend create/update logic

- **File:** `backend/controller/productController.js`
- **Role:** Validates/parses request and persists dish data.
- **Required updates:**
  - In `addDish`, read `price` and `originalPrice` from `req.body`
  - Convert to numeric values before save
  - Add validation (non-negative, optional logical checks)
  - In `updateDish`, perform same parsing/validation for updates
  - Include fields in the object passed to MongoDB

### E. Database schema (persistence contract)

- **File:** `backend/models/DishSchema.js`
- **Role:** Defines stored dish structure.
- **Required updates:**
  - Add numeric fields (example):
    - `price: { type: Number, required: true }`
    - `originalPrice: { type: Number }`
  - Add any business constraints required by product rules

### F. Admin list display (verification after edit)

- **Files:**
  - `dashtar/src/pages/Products.jsx`
  - `dashtar/src/components/product/ProductTable.jsx`
- **Role:** Displays dish records in admin.
- **Required updates:**
  - Add a table header for Price
  - Render price value for each dish row
  - Optionally show original price (strikethrough) + current price

---

## 3) Recommended update sequence

1. Update `DishSchema.js` with price fields  
2. Update `productController.js` (`addDish`, `updateDish`) parsing/validation  
3. Update `AddDishPopup.jsx` form state + inputs + submit payload  
4. Update table files (`Products.jsx`, `ProductTable.jsx`) to display price  
5. Validate by adding/editing a dish in admin and checking list/API response

---

## 4) Quick answer: “Where exactly do I update meal price?”

After implementation, price is updated by admin in:

- **Dashboard -> Menu/Products -> Add/Edit Dish popup**
- Backed by:  
  **`dashtar/src/components/drawer/AddDishPopup.jsx`** (UI input)  
  **`backend/controller/productController.js`** (save/update logic)  
  **`backend/models/DishSchema.js`** (DB storage)

---

## 5) Current gap to be aware of

In the current dish flow, the form and schema do not fully carry dedicated meal price fields.  
Without adding those fields in all layers above, meal price updates will not be consistently saved and shown.

---

## 6) Scope clarification (important)

This guide is specifically for **dish/menu meal pricing**.

It is **not** for school/subscription pricing fields such as:

- `price_per_day_per_child`

Subscription pricing belongs to a separate flow and should be documented/updated separately to avoid mixing pricing models.

---

## 7) If you actually need subscription meal price (`price_per_day_per_child`)

Use these files:

- `dashtar/src/pages/StoreSetting.jsx`  
  Admin UI input for `price_per_day_per_child` in `/store/store-settings`
- `dashtar/src/hooks/useStoreSettingSubmit.js`  
  Loads and submits subscription price value
- `store-without-stripe/src/utils/storeCustomizationSetting.js`  
  Default fallback value (`200`)
- `store-without-stripe/src/components/profile-Step-Form/subscriptionPlanStep.js`  
  Consumes dashboard subscription price
- `store-without-stripe/src/components/renew-subflow/RenewSubscriptionPlanStep.js`  
  Consumes dashboard subscription price during renew flow
