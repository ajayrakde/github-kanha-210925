# Overview

This e-commerce webstore application supports selling up to 10 products, optimized for the Indian market with a mobile-first design. It caters to customers, administrators, and influencers, providing product listings, a shopping cart, OTP-verified checkout, a coupon system, and dedicated dashboards. The project aims to provide a modern, efficient online retail platform.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The frontend is built with React and TypeScript, following a component-based architecture. It uses Wouter for routing and TanStack Query for server state management. UI is developed using shadcn/ui components styled with Tailwind CSS, supporting separate pages for customer, admin, and influencer roles, along with reusable shared components.

## Backend Architecture
The backend is an Express.js application written in TypeScript, running on Node.js. It adheres to a RESTful API design, organizing routes by functionality (e.g., products, cart, orders). Features include session management for cart persistence and middleware for request logging and error handling, supporting both development and production environments.

## Database Design
PostgreSQL serves as the primary database, managed with Drizzle ORM for type-safe operations. The schema includes tables for users, products, orders, cart items, offers/coupons, and influencers, enabling product inventory, order management, coupon usage limits, and influencer performance tracking.

## Authentication & Session Management
Authentication is handled via OTP (One-Time Password) verification sent to phone numbers during checkout. User accounts are automatically created upon their first order. `express-session` manages session data with PostgreSQL persistent storage via `connect-pg-simple`, ensuring sessions persist across server restarts and browser refreshes. Session cookies have a default lifetime of 3 days.

## State Management
Client-side state is managed using TanStack Query for server-related data and React's built-in state management for local UI states. The application employs optimistic updates and cache invalidation for data consistency.

## Mobile-First Design
The application adopts a mobile-first responsive design, featuring a dedicated mobile navigation and touch-friendly interfaces, ensuring full functionality across all devices.

## Technical Implementations
Key technical implementations include atomic order creation with retry logic for Cashfree payments, ensuring data consistency between the local database and the payment gateway. Webhook processing correctly extracts payment statuses and amounts, handling currency unit conversions. Secure payment status polling relies on database reads, rather than direct API calls to payment providers, enhancing security and performance. Webhook signature verification correctly handles raw body processing to prevent signature mismatches caused by JSON parsing. Address deletion includes ownership verification for security.

# External Dependencies

## Database Services
- **Neon Database**: PostgreSQL cloud hosting.
- **Drizzle ORM**: Type-safe ORM for database interactions.

## UI Component Libraries
- **Radix UI**: Accessible, unstyled UI primitives.
- **shadcn/ui**: Component library built on Radix UI.
- **Tailwind CSS**: Utility-first CSS framework.

## Development Tools
- **Vite**: Build tool and development server.
- **TypeScript**: Adds type safety.
- **ESBuild**: Fast JavaScript bundler.

## Third-Party Integrations
- **Cashfree**: Payment gateway for processing transactions, including webhook integration for status updates.
- **Replit Object Storage**: Auto-detected object storage for dynamic provisioning.
- **Google Cloud Storage (GCS)**: Supported object storage provider.
- **Amazon S3 or S3-Compatible Providers**: Supported object storage provider.
- **SMS/OTP Services**: Architectural support for integration.