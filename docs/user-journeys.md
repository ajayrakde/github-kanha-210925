# User Journey Reference

This document captures the primary user journeys supported by the backend API after modularizing the Express routes into feature-specific routers (for example: `server/routes/products.ts`, `server/routes/auth.ts`, `server/routes/orders.ts`, and `server/routes/shipping.ts`). The endpoint structure remains unchanged, but the new routing layout makes the flows easier to reason about and maintain.

## Buyer Checkout Flow
1. **Browse catalog** – `GET /api/products` served from `server/routes/products.ts` returns the curated list of products. Individual product details are fetched with `GET /api/products/:id` from the same module.
2. **Build the cart** – cart operations (`POST /api/cart/items`, `PATCH /api/cart/items/:id`, `DELETE /api/cart/items/:id`) remain in `server/routes/cart.ts` and continue to rely on the anonymous session that `registerRoutes` seeds in `server/routes/index.ts`.
3. **Authenticate with OTP** – buyers request an OTP through `POST /api/auth/send-otp` and validate it via `POST /api/auth/login`, both implemented in `server/routes/auth.ts`. Successful login attaches the buyer context to the session.
4. **Manage addresses** – saved address endpoints under `/api/auth/addresses` (create, list, update preferred, delete) live in `server/routes/auth.ts` and enforce ownership checks through the session-bound `userId`.
5. **Place order** – submitting the checkout form still calls `POST /api/orders` handled by `server/routes/orders.ts`, which validates payloads, persists order data, redeems offers, and clears the cart.
6. **Shipping charge confirmation** – `server/routes/orders.ts` leverages the helper in `server/storage.ts` to compute shipping; buyers can also query `/api/shipping/calculate` (implemented in `server/routes/shipping.ts`) to preview charges before finalizing.

## Administrator Management Flow
1. **Session & auth** – administrators authenticate through the dedicated `/api/admin` endpoints backed by `server/routes/admin.ts`. The shared `requireAdmin` middleware is created in `server/routes/index.ts` and injected into routers that need elevated privileges.
2. **Product operations** – CRUD endpoints for products (`/api/products`) are now encapsulated in `server/routes/products.ts`, ensuring only admins (via `requireAdmin`) can create, edit, or delete entries.
3. **Shipping rule configuration** – `server/routes/shipping.ts` provides `/api/admin/shipping-rules` to create, update, and delete shipping rules while validating schemas with Zod. These endpoints continue to require an authenticated admin session.
4. **Order oversight** – admin-specific order management remains available under `/api/admin/orders` (in `server/routes/admin.ts`), unaffected by the refactor.

## Influencer Coupon Flow
1. **Influencer onboarding** – influencer login and coupon management flows are implemented in `server/routes/influencers.ts`. Sessions are seeded in the same way as other routes via `registerRoutes`.
2. **Offer performance** – analytics endpoints under `/api/analytics` (`server/routes/analytics.ts`) remain unchanged, supplying dashboards that reference influencer coupons and conversion statistics.

## Impact of Route Modularization
- **Shared middleware** (sessions, rate limiting, and `requireAdmin`) is still established in `server/routes/index.ts` before any feature router is mounted, so all journeys above retain their expected protections.
- **Endpoint URLs and request/response contracts** did not change. Frontend flows, automated smoke tests, and external integrations continue to operate without modification.
- **Ownership and role checks** continue to occur inside their respective modules (e.g., address deletion in `server/routes/auth.ts`, admin-only access in `server/routes/products.ts` and `server/routes/shipping.ts`).

These notes should be reviewed whenever a journey is expanded to ensure the modular router structure continues to cover the required middleware and authorization behaviors.
