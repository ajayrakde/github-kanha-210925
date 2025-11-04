import type { TickerMessage } from "@/components/layout/ticker-bar";

export const TICKER_MESSAGES: TickerMessage[] = [
  {
    id: "free-delivery",
    text: "Free Delivery on Orders Above ₹499",
    icon: "🚚",
  },
  {
    id: "flash-sale",
    text: "Flash Sale: Up to 30% Off on Selected Items",
    icon: "⚡",
  },
  {
    id: "same-day",
    text: "Order Before 2 PM for Same-Day Delivery",
    icon: "📦",
  },
  {
    id: "healthy",
    text: "100% Natural & Healthy Snacks for Kids",
    icon: "🌿",
  },
  {
    id: "quality",
    text: "Premium Quality Guaranteed",
    icon: "✨",
  },
];

export const STORY_CATEGORIES = [
  {
    id: "new",
    label: "New",
    gradient: "from-purple-500 to-pink-500",
    category: null,
  },
  {
    id: "hot-deals",
    label: "Hot Deals",
    gradient: "from-orange-500 to-red-500",
    category: null,
  },
  {
    id: "chips",
    label: "Chips",
    gradient: "from-yellow-400 to-orange-500",
    category: "chips",
  },
  {
    id: "cookies",
    label: "Cookies",
    gradient: "from-amber-500 to-orange-600",
    category: "cookies",
  },
  {
    id: "chocolates",
    label: "Chocolates",
    gradient: "from-brown-400 to-amber-700",
    category: "chocolates",
  },
  {
    id: "candies",
    label: "Candies",
    gradient: "from-pink-400 to-red-500",
    category: "candies",
  },
  {
    id: "drinks",
    label: "Drinks",
    gradient: "from-blue-400 to-cyan-500",
    category: "drinks",
  },
  {
    id: "healthy",
    label: "Healthy",
    gradient: "from-green-400 to-emerald-500",
    category: "healthy",
  },
];
