# Overview

This is a simple e-commerce webstore application designed for selling up to 10 products online. The system is built with a mobile-first approach and is specifically optimized for the Indian market. The application supports three types of users: customers (who can browse and purchase products), administrators (who manage products and orders), and influencers (who can track their coupon performance).

The application features a modern tech stack with React/TypeScript frontend, Express.js backend, and PostgreSQL database. It includes essential e-commerce functionality like product listings, shopping cart, checkout process with OTP verification, coupon/discount system, and comprehensive admin and influencer dashboards.

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