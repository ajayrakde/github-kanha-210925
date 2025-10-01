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
   - PhonePe webhook verification now preserves provider terminal states like `CANCELLED`, `EXPIRED`, and `TIMEDOUT` as cancelled payments so buyer-initiated aborts or timeouts don't surface as failed orders in downstream journeys.
   - The payment controller now requires an `Idempotency-Key` header for `POST /api/payments/create` and `/api/payments/refunds`, caching the first successful attempt so rapid retries return the same response instead of initiating duplicate charges.
   - Captured UPI payments are guarded both at the service layer and with a database uniqueness constraint so a second PhonePe attempt for the same order returns a clear `UPI_PAYMENT_ALREADY_CAPTURED` error instead of racing a duplicate transaction.
   - PhonePe iframe checkouts now call `/api/payments/token-url`, which wraps the generic create-payment service to return the provider's PayPage URL and merchant transaction ID for the embedded `PhonePeCheckout.transact` flow while reusing a deterministic (tenant + order + amount) idempotency key so rapid double-submissions get the same token URL and expired attempts are safely invalidated before retrying.
   - `/api/payments/token-url` now cross-checks the stored order amount/currency before creating a PhonePe checkout, rejecting tampered payloads with an audit trail so iframe launches cannot be spoofed by modified client requests.
   - `/api/payments/create` now re-validates the order's stored amount/currency prior to invoking any gateway, blocks mismatches with an audit log, and returns only sanitized payment metadata to browsers while preserving the full provider response in the audit trail for compliance.
   - After PhonePe redirects the buyer back, the thank-you page first pings `/api/payments/phonepe/return` to log a "processing" event without touching order state, then begins polling `/api/payments/order-info/:orderId` so buyers see a "Processing" badge until the webhook settles the charge.
   - `/api/payments/order-info/:orderId` aggregates the order totals, shipping/tax breakdown, and the latest UPI identifiers (transaction id, UTR, VPA, receipt link) so the Thank-you and order history screens stay in sync with webhook-driven updates.
   - Refund creation now enforces captured-vs-refunded guardrails, persists cumulative refund totals, records audit events for attempts that exceed the captured amount, and requires deterministic `merchantRefundId` inputs so duplicate submissions return the previously stored result while continuing to expose masked refund identifiers through `/api/payments/order-info/:orderId`.
   - `/api/payments/order-info/:orderId` now emits a per-transaction refund ledger (masked UTRs, merchant IDs, minor-unit amounts, and timestamps) so the thank-you and support surfaces can show granular PhonePe refund progress alongside the latest payment record.
   - PhonePe failure or cancellation webhooks now persist a `paymentFailedAt` timestamp, downgrade the order's payment status to `failed`, and log an audit trail for support. The thank-you page consumes the new `/api/payments/order-info/:orderId` failure flags to show a retry payment CTA so buyers can immediately attempt another charge.
   - When the PhonePe polling worker marks a checkout attempt as `expired`, the thank-you page exposes a "Start again" control wired to `/api/payments/phonepe/retry`. The endpoint validates that the most recent reconciliation job truly expired, reissues a fresh PhonePe create-payment call, resets the order's `paymentStatus` to `processing`, and schedules a new polling job so buyers can restart payment without leaving the confirmation screen.
   - When buyers abort the embedded PhonePe checkout, the frontend posts to `/api/payments/cancel`, which flips the pending attempt to `CANCELLED`, records an audit event, and marks the order's `paymentStatus` as `failed` without cancelling the order so retries remain available instantly.
   - PhonePe retries, payment cancellations, and refund creation now require an authenticated buyer session (or admin role), enforce tenant-aware ownership checks, and apply short-term rate limiting so malicious actors cannot spam cross-tenant or third-party orders.
   - Checkout now threads the buyer's PhonePe instrument preference (Intent, Collect, or QR) through `providerOptions`, advertising the selected variant in the pay request while keeping other UPI modes disabled so the hosted experience mirrors the shopper's choice without exposing unsupported payment rails.
   - Embedded PhonePe launches now flag `payPage: 'IFRAME'` in addition to the instrument preference so the adapter explicitly requests a `PAY_PAGE` token from PhonePe while still locking the shopper's chosen UPI mode inside `paymentModeConfig`.
   - The storefront's payment status poller now reads `/api/payments/status/:id`'s `data.status` response shape (COMPLETED/FAILED/PENDING), continuing to hold the thank-you transition until the webhook/status API reports `COMPLETED` and surfacing an inline retry UI whenever `FAILED` is returned.
   - UPI evidence returned from `/api/payments/order-info/:orderId` now masks the payer VPA/UTR for PhonePe transactions and includes the normalized instrument variant label (Collect, Intent, QR) so downstream UIs show readable context without exposing raw identifiers.
   - A PhonePe polling worker persists mandated status-check intervals in the database, surfaces the next scheduled probe through `/api/payments/order-info/:orderId`, and stops automatically once the gateway returns a terminal state or the `expireAfter` deadline passes. The cadence now follows the required sequence (20 s, 25 s, 3 s × 10, 6 s × 10, 10 s × 6, 30 s × 2, then 60 s until expiry), keeping reconciliation idempotent across restarts and letting the thank-you page show real-time progress messages.

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
   - The admin payment provider console now communicates exclusively through `/api/payments/admin/provider-configs` (fetch + save) and `/api/payments/admin/providers/:provider/health-check`, which return `{ success, data }` envelopes that rely on the active admin session cookie (sent with `credentials: include`).
   - PhonePe API traffic now reuses a shared OAuth token manager that refreshes access tokens a few minutes before expiry and retries once on authentication failures, ensuring checkout, refund, and status checks remain seamless for buyers and support staff even during sustained traffic.
   - Host switching, sandbox VPAs, and simulator fixtures are documented in the [PhonePe Sandbox & Simulator guide](../README.md#phonepe-sandbox--simulator).
7. **PhonePe Reconciliation Console**
   - Support agents can open `/admin/phonepe-reconciliation?orderId={orderId}` to access a dedicated console backed by `GET /api/payments/admin/phonepe/orders/:orderId`.
   - The endpoint re-queries PhonePe's order status API through the adapter, returning the latest gateway state, response code, and raw UPI instrument payload alongside masked identifiers stored on the order.
   - The UI surfaces the active reconciliation job (status, attempt, next poll, errors) so teams can confirm whether polling is still progressing or has reached a terminal state before retrying a payment.

---

## Influencer Flow
1. **Authentication**
   - Influencer login/profile handled by `server/routes/influencers.ts`, backed by `usersRepository`.
   - Self-serve influencer operations (login/logout/profile) live under `/api/influencer` and require an authenticated influencer session.

2. **Lifecycle Management**
   - Admin creates/deactivates influencers using `/api/influencers`, protected by the `requireAdmin` middleware.
   - Anonymous calls to lifecycle routes receive `401` responses to ensure only admins manage influencer accounts.

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
