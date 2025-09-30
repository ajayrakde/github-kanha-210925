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
   - Orders now persist the selected `paymentMethod` while defaulting both `status` and `paymentStatus` to `pending` until the gateway confirms payment, allowing retries without losing cart context.
   - Payment capture events atomically mark orders as confirmed/paid and store gateway identifiers (PhonePe merchant transaction ID, provider transaction ID, UTR, payer handle, and a receipt link) so post-checkout experiences surface accurate payment evidence.
   - Incoming PhonePe callbacks/webhooks now reconcile the captured amount against the original authorization, logging and suppressing mismatched payloads while still acknowledging replays so buyers never see duplicate confirmations from tampered notifications.
   - The payment controller now requires an `Idempotency-Key` header for `POST /api/payments/create` and `/api/payments/refunds`, caching the first successful attempt so rapid retries return the same response instead of initiating duplicate charges.
   - Captured UPI payments are guarded both at the service layer and with a database uniqueness constraint so a second PhonePe attempt for the same order returns a clear `UPI_PAYMENT_ALREADY_CAPTURED` error instead of racing a duplicate transaction.
   - `/api/payments/order-info/:orderId` aggregates the order totals, shipping/tax breakdown, and the latest UPI identifiers (transaction id, UTR, VPA, receipt link) so the Thank-you and order history screens stay in sync with webhook-driven updates.

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
   - Webhook ingestion now auto-detects the correct provider across all enabled configs per tenant, deduplicates payloads with event/transaction identifiers, and rejects invalid signatures with audit logs so replay attempts are acknowledged without mutating state.
   - PhonePe now sources its client credentials (`client_id`, `client_secret`, `client_version`), webhook basic-auth pair, redirect URL, and API hosts from the PAYAPP_* secret bundle while keeping the merchant ID in admin-managed database config, preventing drift between environments.
   - PhonePe API traffic now reuses a shared OAuth token manager that refreshes access tokens a few minutes before expiry and retries once on authentication failures, ensuring checkout, refund, and status checks remain seamless for buyers and support staff even during sustained traffic.

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
