# Overview

This is a simple e-commerce webstore application designed for selling up to 10 products online. The system is built with a mobile-first approach and is specifically optimized for the Indian market. The application supports three types of users: customers (who can browse and purchase products), administrators (who manage products and orders), and influencers (who can track their coupon performance).

The application features a modern tech stack with React/TypeScript frontend, Express.js backend, and PostgreSQL database. It includes essential e-commerce functionality like product listings, shopping cart, checkout process with OTP verification, coupon/discount system, and comprehensive admin and influencer dashboards.

# Recent Changes

## 2025-10-06 - Payment Page UX & Checkout Validation Debugging
- **Payment Page Auto-Polling Fix**: Removed automatic payment creation and polling on page load to prevent premature API calls
  - **Previous Behavior**: Payment page would auto-create pending payment and start polling immediately on load
  - **New Behavior**: Payment page loads order data only, waits for user interaction before creating payment/polling
  - **VPA Flow**: Create pending payment and start polling only when user clicks "Pay" button after entering UPI ID
  - **QR/App Intent Flows**: Still auto-poll after payment creation since user interaction happens outside the app
  - **Impact**: Better UX, reduced unnecessary API calls, polling starts at appropriate time for each payment method
- **Checkout Validation Debugging**: Added comprehensive debug logging to track Place Order button validation states
  - Logs all validation conditions: name, addressLine1, addressLine2, city, pincode validity, shipping calculation state
  - Logs button enable/disable determination logic to browser console
  - Helps diagnose issues where button appears disabled despite form being complete
- **Files Modified**:
  - `client/src/pages/payment.tsx`: Removed auto-polling from page load, added payment creation on Pay button click
  - `client/src/pages/checkout.tsx`: Added useEffect with comprehensive validation state logging

## 2025-10-06 - Cashfree Webhook Currency Unit Conversion Fix
- **Issue**: Cashfree success webhooks were returning 200 "processed" but not updating order payment status to "paid"
  - **Root Cause**: Currency unit mismatch - Cashfree sends payment amounts in rupees (e.g., 380) while database stores in paise (38,000). The webhook code detected this as potential tampering and skipped order promotion.
  - **Solution**: Updated `extractCapturedAmount()` function to:
    1. Extract `payment.payment_amount` from Cashfree webhook structure
    2. Detect amounts in major currency units (< 10,000) and convert to minor units (multiply by 100)
    3. Add debug logging for currency conversion and amount mismatch detection
  - **Impact**: Success webhooks now properly update both payment status (PENDING → COMPLETED) and order status (pending → paid/confirmed)
- **Files Modified**:
  - `server/services/webhook-router.ts`: Updated amount extraction and added comprehensive logging

## 2025-10-06 - Payment Architecture Fixes: Webhook Signature & Secure Polling
- **Issue 1 - Webhook Signature Verification**: Cashfree webhook signature verification was failing because Express JSON middleware was parsing decimal values (e.g., `170.00` → `170`), causing signature mismatch
  - **Root Cause**: Cashfree computes webhook signature using `HMAC-SHA256(timestamp + rawBody)` which requires the exact raw payload format including decimal precision
  - **Solution**: Configured Express to use `express.raw()` middleware for webhook routes to preserve raw body as Buffer
  
- **Issue 2 - Status Endpoint Architecture**: Payment status polling was calling Cashfree API on every request instead of reading from database
  - **Root Cause**: Status endpoint was calling `paymentsService.verifyPayment()` which made API calls to Cashfree
  - **Solution**: Changed status endpoint to query database only - webhooks update DB, frontend reads cached status
  - **Security**: Restored `requireAuthenticatedSession` middleware for proper access control
  
- **Correct Payment Flow**:
  ```
  Backend ↔ Cashfree:
    - Cashfree webhook → Backend verifies signature → Updates database
  
  Frontend ↔ Backend:
    - User logs in via OTP → Session created
    - Frontend polls GET /api/payments/status/:paymentId (authenticated)
    - Backend reads cached status from database (no Cashfree API call)
    - Frontend polls until status changes from PENDING/PROCESSING to COMPLETED/FAILED
  ```
  
- **Implementation Details**:
  - Added `app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))` before `express.json()` middleware
  - Modified status endpoint to return cached payment data from database without calling payment provider APIs
  - Restored authentication requirement on status endpoint for security
  - Session properly maintained after OTP verification throughout payment flow
  
- **Files Modified**:
  - `server/index.ts`: Added raw body middleware for webhook routes
  - `server/routes/payments.ts`: Changed status endpoint to DB-only reads with authentication restored

## 2025-01-06 - Atomic Cashfree Order Creation with Retry Logic
- **Implementation**: Atomic order creation ensures both local database order and Cashfree payment order are created together
- **Retry Mechanism**: 3 attempts with exponential backoff (100ms, 200ms, 400ms delays)
- **Duplicate Prevention**: Before each retry, checks if Cashfree order already exists using checkOrderExists method
- **Schema Extensions**: Added tracking fields to orders table:
  - `cashfreeOrderId`: Cashfree's order identifier
  - `cashfreePaymentSessionId`: Payment session ID for frontend checkout widget
  - `cashfreeOrderStatus`: Current Cashfree order status
  - `cashfreeCreated`: Boolean flag indicating if Cashfree order was successfully created
  - `cashfreeAttempts`: Number of Cashfree creation attempts made
  - `cashfreeLastError`: Last error message from Cashfree API for debugging
- **Error Handling**:
  - Full failure (local order creation fails): Returns error, user sees "try again later"
  - Partial success (local order saved, Cashfree fails after retries): Returns order with cashfreeCreated=false, user sees "we'll contact you" message
  - Full success: Returns order with Cashfree details, proceeds to payment
- **Frontend Updates**:
  - Checkout page handles partial success scenarios with appropriate user messaging
  - Payment session ID stored in sessionStorage and passed to payment page
  - Payment page uses stored session ID instead of creating duplicate Cashfree orders
- **Files Modified**:
  - `shared/schema.ts`: Extended orders table schema with Cashfree tracking fields
  - `server/utils/retry.ts`: Created retry utility with exponential backoff
  - `server/adapters/cashfree-adapter.ts`: Added checkOrderExists method
  - `server/routes/orders.ts`: Implemented atomic order creation with retry logic
  - `server/storage/orders.ts`: Added updateCashfreeOrderDetails repository method
  - `client/src/pages/checkout.tsx`: Added partial success handling
  - `client/src/pages/payment.tsx`: Updated to use stored paymentSessionId

## 2025-01-06 - Security Fix for Address Deletion
- **Security Vulnerability Fixed**: The DELETE /api/auth/addresses/:id endpoint now properly verifies address ownership before deletion
- **Storage Method Updated**: The deleteUserAddress method now requires and validates userId parameter
- **Changes Made**:
  - Modified `server/storage.ts`: Updated deleteUserAddress signature to include userId parameter
  - Modified `server/routes/auth.ts`: Updated DELETE address route to pass userId for ownership verification
  - Added database constraint using `and(eq(userAddresses.id, id), eq(userAddresses.userId, userId))` to ensure only address owners can delete their addresses

## Object Storage Configuration

The backend auto-detects the Replit Object Storage sidecar. When the sidecar responds, it provisions Google Cloud Storage credentials dynamically and no additional configuration is required beyond the existing `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` values.

For self-hosted deployments or in any environment where the sidecar is unreachable, set `OBJECT_STORAGE_PROVIDER` and supply credentials for the desired backend:

- `OBJECT_STORAGE_PROVIDER`
  - `replit` – attempt to use the sidecar (default behaviour when the variable is unset)
  - `gcs` – force Google Cloud Storage credentials from environment variables
  - `s3` – force S3-compatible credentials

### Google Cloud Storage (GCS)

Provide the following variables when using a service account:

- `OBJECT_STORAGE_GCS_PROJECT_ID`
- `OBJECT_STORAGE_GCS_CLIENT_EMAIL`
- `OBJECT_STORAGE_GCS_PRIVATE_KEY` (escape newlines as `\n` if stored inline)

### Amazon S3 or S3-Compatible Providers

Provide these variables when targeting S3:

- `OBJECT_STORAGE_S3_ACCESS_KEY_ID`
- `OBJECT_STORAGE_S3_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_S3_REGION`
- `OBJECT_STORAGE_S3_ENDPOINT` (optional for custom endpoints, e.g. MinIO, Cloudflare R2)
- `OBJECT_STORAGE_S3_FORCE_PATH_STYLE` (optional, set to `true` for providers that require path-style URLs)

`PRIVATE_OBJECT_DIR` must continue to reference the bucket and prefix (e.g. `/my-bucket/private`) and `PUBLIC_OBJECT_SEARCH_PATHS` should list any public prefixes that the application should scan.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The frontend is built using React with TypeScript and follows a component-based architecture. It uses Wouter for client-side routing and TanStack Query for server state management. The UI is built with shadcn/ui components and styled with Tailwind CSS. The application is structured with separate pages for different user roles (customers, admin, influencer) and includes shared components for reusable UI elements.

## Backend Architecture
The backend uses Express.js with TypeScript running on Node.js. It follows a RESTful API design pattern with routes organized by functionality (products, cart, orders, offers, users). The server includes session management for cart persistence and implements middleware for request logging and error handling. The architecture supports both development and production environments with appropriate build configurations.

## Database Design
The system uses PostgreSQL as the primary database with Drizzle ORM for type-safe database operations. The schema includes tables for users, products, orders, cart items, offers/coupons, influencers, and their relationships. The database supports features like product inventory tracking, order management, coupon usage limits, and influencer performance tracking.

## Authentication & Session Management
User authentication is implemented through OTP (One-Time Password) verification sent to phone numbers during checkout. No pre-registration is required - accounts are automatically created when users place their first order. Session management handles cart persistence across user interactions using express-session.

## State Management
Client-side state is managed using TanStack Query for server state and React's built-in state management for local UI state. The application uses optimistic updates and proper cache invalidation to ensure data consistency across components.

## Mobile-First Design
The application is designed with a mobile-first approach using responsive design principles. It includes a dedicated mobile navigation component and touch-friendly interfaces optimized for mobile devices while remaining fully functional on desktop.

# External Dependencies

## Database Services
- **Neon Database**: PostgreSQL database hosting service configured via DATABASE_URL environment variable
- **Drizzle ORM**: Type-safe database operations and migrations

## UI Component Libraries
- **Radix UI**: Unstyled, accessible UI primitives for building the design system
- **shadcn/ui**: Pre-built component library built on top of Radix UI
- **Tailwind CSS**: Utility-first CSS framework for styling

## Development Tools
- **Vite**: Build tool and development server with hot module replacement
- **TypeScript**: Type safety across the entire application stack
- **ESBuild**: Fast JavaScript bundler for production builds

## Third-Party Integrations
The application is structured to support payment integrations (specifically mentioned UPI payments for Indian market) and SMS/OTP services for user verification, though specific providers are not currently implemented in the codebase. The architecture includes placeholder components for these integrations.