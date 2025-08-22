Here’s your **proofed and polished prompt** for Replit (or GitHub README). I’ve merged everything we discussed — product, admin, influencer flows, one-to-many influencer–offer mapping, usage limits, and expiry. It’s concise but covers all requirements clearly.

---

# Simple Webstore (Max 10 Products)

A minimal webstore application to sell up to 10 products online.
Designed to be **mobile-first**, **India-specific**, and intentionally simple.

---

## 🎯 User Features

* **Product Listing** – Browse up to 10 products.
* **Cart & Order Management** – Add/remove items, manage cart, and place orders.
* **Checkout** – Optimized for India.
* **Coupon/Discounts** – Apply coupon codes (flat value or % of order).
* **Payment Integration** – UPI-based payments.
* **Account Creation via OTP** –

  * Users do not register beforehand.
  * At checkout, phone number is verified by OTP.
  * Account auto-created with phone number.
  * Name, address, etc. collected from order form.

---

## 🛠️ Admin Features

* **Product Management** – Add/remove products, update prices.
* **Order Tracking** – View successful orders and export user+order details to CSV.
* **Abandoned Carts** – See carts left without checkout.
* **Offer Management** – Create/manage coupon codes:

  * Activate/deactivate offers.
  * Flat or % discount, with optional **max discount** and **minimum cart value**.
  * **Map each offer to an Influencer** (one-to-many relationship).
  * Set **expiry date/time**.
  * Set **per-user usage limit** and **global usage limit** at creation.

---

## 📢 Influencer Features

* **Coupon Dashboard** – See all offers assigned to them.
* **Performance Tracking** –

  * # of delivered orders via their coupons.
  * Total discount value offered.
  * Total sales generated.
  * Remaining quota (global limit – used).

---

## 🧾 Offer & Redemption Rules

* An offer is **valid** only if:

  * Active (`is_active = true`).
  * Within start/end date.
  * Min cart value satisfied.
  * Usage limits not exceeded (per-user or global).
* **Redemption** is recorded only after successful payment.
* Clear error messages:

  * “Coupon expired.”
  * “Usage limit reached.”
  * “Minimum cart value not met.”

---

## 📂 Minimal UI Pages

* `/` → Product grid (≤10).
* `/cart` → Manage items, apply coupon.
* `/checkout` → Phone OTP → Address → Pay (UPI).
* `/thank-you` → Order summary.
* `/admin` → Products, Orders (CSV), Offers (map influencer, limits, expiry), Abandoned Carts.
* `/influencer` → Offers + Performance stats.

---

## ⚙️ Suggested Stack (Replit-friendly)

* **Backend:** Node.js + Express
* **Database:** SQLite (with Drizzle ORM or Prisma)
* **Auth:** OTP (mock in dev, SMS gateway/Firebase in prod)
* **Payments:** UPI intent/QR → webhook for success/failure
* **Frontend:** Minimal React or plain HTML/JS, mobile-first

---

✅ This prompt is now clear, professional, and ready to paste into Replit’s project description or README.

Would you like me to also give you a **starter `schema.sql` migration file** for SQLite so you can paste it directly into Replit DB setup?
