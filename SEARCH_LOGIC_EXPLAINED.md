# Search Logic (Human-Readable)

This project has two main search flows:

1. **Storefront product search** (what customers use)
2. **Admin list filtering/search** (what staff/admin use)

---

## 1) Storefront Product Search Flow

### Step A: User enters text in navbar search
- File: `store-without-stripe/src/layout/navbar/Navbar.js`
- The search box keeps text in `searchText`.
- On submit:
  - If text exists, user is redirected to:  
    `/search?query=<typed_text>`
  - The search input is then cleared.

### Step B: Search page fetches matching products on server side
- File: `store-without-stripe/src/pages/search.js`
- In `getServerSideProps`, query params are read:
  - `query` (search text)
  - `_id` (category id, if provided)
- It calls:
  - `ProductServices.getShowingStoreProducts({ category, title })`
  - and also fetches attributes.

### Step C: Storefront service sends query params to backend
- File: `store-without-stripe/src/services/ProductServices.js`
- Request format:
  - `GET /products/store?category=<...>&title=<...>&slug=<...>`

### Step D: Backend builds MongoDB query
- File: `backend/controller/productController.js` (`getShowingStoreProducts`)
- Base condition is always:
  - `status: "show"` (only visible products)
- Optional filters:
  - `category` → match product categories
  - `title` → case-insensitive regex search across all supported language title fields
  - `slug` → case-insensitive regex on slug

### Step E: Backend behavior by request type
- If `slug` exists:
  - returns matching products + related products from same category
- Else if `title` or `category` exists:
  - returns filtered matching products (up to 100)
- Else (no filters):
  - returns default discovery data:
    - popular products (top sales)
    - discounted products

### Step F: Frontend post-processing on search page
- File: `store-without-stripe/src/pages/search.js` + `store-without-stripe/src/hooks/useFilter.js`
- `useFilter(products)` supports:
  - Price sorting (`Low`, `High`) on the loaded result set.
- UI then:
  - shows total matched count,
  - renders product cards,
  - supports “Load more” pagination on the client view.

---

## 2) Admin Search / Filter Logic

### Admin API filtering
- File: `backend/controller/productController.js` (`getAllProducts`)
- Reads query params:
  - `title`, `category`, `price`, `page`, `limit`
- Supports:
  - text search in multilingual `title.*` fields (case-insensitive regex),
  - category filtering,
  - sort/filter modes via `price` value (low/high price, published/unpublished, stock states, date sort options),
  - pagination with `page` and `limit`.

### Admin UI filtering
- File: `dashtar/src/hooks/useFilter.js`
- Performs client-side filtering/sorting for lists in admin pages:
  - text search (products/users/coupons/orders),
  - status/role/time filters,
  - category/attribute/language/currency/country filters,
  - low/high sort modes.

---

## In Short

- **Customer search** starts from navbar input → `/search` page → backend `/products/store` → regex/category filtering in MongoDB.
- **Admin search** uses backend query filtering (`/products`) plus additional UI-side filtering for table/list workflows.
