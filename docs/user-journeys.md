# User Journey Overview

This document summarizes the primary user journeys that the platform supports. The recent storage refactor
only reorganizes the server-side data access layer, so no behavioural changes are expected for these flows.

## Buyer
1. **Browse Products** – The buyer loads `/api/products` to view the active catalog. Product read operations
   now use the `productsRepository`, but the API response remains unchanged.
2. **Manage Cart** – Adding, updating, and clearing cart items goes through `/api/cart` endpoints backed by the
   `ordersRepository` cart helpers. Cart persistence and validation continue to behave identically.
3. **Checkout** – During `/api/orders` creation the service still enriches the order with addresses, offers,
   and shipping rules via the specialised repositories. The overall order placement flow, including offer
   validation and shipping calculation, is unaffected.
4. **Account Management** – Authentication, OTP verification, and address CRUD operations now leverage the
   `usersRepository` and `settingsRepository`. Session handling and exposed responses are preserved.

## Admin
1. **Authenticate** – Admin login (`/api/admin/login`) validates credentials through the `usersRepository`.
   Session creation and response payloads remain the same.
2. **Manage Catalog & Offers** – CRUD endpoints for products, offers, and shipping rules continue to operate
   with the new repositories. Authorisation and validation logic is unchanged.
3. **View Orders & Analytics** – Order exports and analytics dashboards rely on the `ordersRepository` for
   data retrieval. The returned datasets match the previous implementation.
4. **Configure Settings** – Application configuration calls (`/api/admin/settings`) now use the
   `settingsRepository`, but setting keys, values, and auditing semantics are consistent.

## Influencer
1. **Authentication** – Influencer login and profile retrieval continue to function via the `usersRepository`.
2. **Lifecycle Management** – Admin-led creation/deactivation of influencers map to the same routes, now backed
   by the dedicated repository without changing validations or responses.

## Shipping & Offers Behaviour
Shipping charge calculation and coupon validation were moved into `shippingRepository` and `offersRepository`
respectively. Both modules retain the previous logic for matching rules, computing costs, and enforcing
redemption limits, so customer-facing behaviour is preserved.

Should a future change adjust any flow above, update this document with the new steps and highlight
dependencies between repositories and routes to keep implementation and documentation aligned.
