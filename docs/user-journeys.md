# User Journey Reference

This document summarizes the primary user journeys supported by the backend API.  
Two recent refactors were applied:
1. **Storage Layer Refactor** – migrated to per-domain repositories (`productsRepository`, `ordersRepository`, `usersRepository`, etc.).
2. **Route Modularization** – split Express routes into feature-specific routers (e.g., `server/routes/products.ts`, `server/routes/auth.ts`, etc.).

Both refactors improved maintainability but did not change **endpoint URLs** or **response contracts**. Customer-facing behavior remains consistent.

---

## Buyer Flow
1. **Browse Catalog**  
   - `GET /api/products` and `GET /api/products/:id` now handled by `server/routes/products.ts`, backed by `productsRepository`.
   - API responses unchanged.

2. **Manage Cart**  
   - Endpoints:  
     - `POST /api/cart/items`  
     - `PATCH /api/cart/items/:id`  
     - `DELETE /api/cart/items/:id`  
   - Implemented in `server/routes/cart.ts`, using `ordersRepository` cart helpers.  
   - Persistence, validation, and session handling unchanged.

3. **Authenticate with OTP**  
   - `POST /api/auth/send-otp`, `POST /api/auth/login` in `server/routes/auth.ts`, backed by `usersRepository`.  
   - Successful login attaches buyer context to session.

4. **Manage Addresses**  
   - `/api/auth/addresses` endpoints (create/list/update/delete) in `server/routes/auth.ts`.  
   - Enforce ownership checks via `userId` in session.  
   - Data stored via `usersRepository`.

5. **Checkout / Place Order**
   - `POST /api/orders` handled by `server/routes/orders.ts`.
   - Enriches order with addresses, offers, and shipping rules using domain repositories.
   - Order placement flow, including offer validation and shipping, is unchanged.
   - `GET /api/payments/order-info/:orderId` aggregates payment attempts, refund totals, and normalized order status so the thank-you page can poll for completion without calling provider-specific APIs.
   - UPI/PhonePe payments now inject explicit success, failure, and cancel URLs so that successful payments land on `/thank-you?orderId=...` and failures or cancellations route shoppers back to `/checkout` with contextual messaging. The cart is only cleared after the payment has been confirmed, allowing buyers to retry without losing their selections when a payment attempt fails.

6. **Shipping Charges**  
   - Shipping calculation moved to `shippingRepository`.  
   - Buyers can preview with `GET /api/shipping/calculate` in `server/routes/shipping.ts`.  
   - Logic for matching rules and computing costs unchanged.

---

## Administrator Flow
1. **Authentication**  
   - `/api/admin/login` handled in `server/routes/admin.ts`, backed by `usersRepository`.  
   - `requireAdmin` middleware from `server/routes/index.ts` protects routes.

2. **Product & Offer Management**  
   - CRUD operations under `/api/products` and `/api/admin/offers`.  
   - Encapsulated in `server/routes/products.ts` and backed by `productsRepository` & `offersRepository`.  
   - Validation and authorization unchanged.

3. **Shipping Rule Configuration**  
   - `/api/admin/shipping-rules` in `server/routes/shipping.ts`, validated via Zod.  
   - Backed by `shippingRepository`.

4. **Orders & Analytics**  
   - `/api/admin/orders` in `server/routes/admin.ts`, backed by `ordersRepository`.  
   - `/api/analytics` in `server/routes/analytics.ts`.  
   - Returned datasets and dashboards unchanged.

5. **Settings**
   - `/api/admin/settings` in `server/routes/admin.ts`, backed by `settingsRepository`.
   - Setting keys/values and auditing semantics preserved.
6. **Payment Providers**
   - Enabling a gateway now requires matching Replit secrets to be present.
   - Missing secrets cause an explicit configuration error instead of silently proceeding, ensuring admins fix misconfigurations before go-live.
   - Runtime API calls (create/verify payment, refunds) now return HTTP 409 with the provider name and missing secret keys when no enabled gateway can be resolved, so client flows can surface actionable setup guidance instead of generic failures.
   - Webhook ingestion now auto-detects the correct provider across all enabled configs per tenant and deduplicates payloads with tenant-aware hashes, preventing cross-tenant collisions.
   - Payment records and refunds are persisted with explicit tenant scoping so audit reports and follow-up actions never mix data across tenants.
   - Admin dashboards load payment provider setup data via `/api/payments/admin/provider-configs`, which now returns both raw database configuration rows and secret validation status so the Payments tab can render reliably.

---

## Influencer Flow
1. **Authentication**  
   - Influencer login/profile handled by `server/routes/influencers.ts`, backed by `usersRepository`.

2. **Lifecycle Management**  
   - Admin creates/deactivates influencers using the same routes, now backed by `usersRepository`.

3. **Coupon & Analytics**  
   - Coupon redemption logic moved to `offersRepository`.  
   - Analytics under `/api/analytics` reference influencer coupons and conversions.

---

## Impact of Refactors
- **Repositories**: Per-domain repositories centralize data logic, improving maintainability.  
- **Routers**: Modular routers clarify ownership of endpoints and middleware.  
- **Contracts**: No change in request/response schemas.  
- **Middleware**: Sessions, rate limiting, and role checks (`requireAdmin`) remain enforced.  
- **Customer Behavior**: Unchanged across all journeys.

---

⚠️ **Next Step:** If future changes modify request/response contracts or flow logic, this document should be updated to capture:
- Dependencies between repositories and routes.
- Any changed behavior for buyers, admins, or influencers.
- Payment enablement prerequisites for each environment.
