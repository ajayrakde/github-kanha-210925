import { Link } from "wouter";

import { useCart } from "@/hooks/use-cart";
import UserMenu from "./user-menu";

export default function Header() {
  const { cartItems } = useCart();

  const cartCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <nav className="flex items-center justify-between" aria-label="Primary navigation">
          <Link
            href="/"
            className="flex items-center space-x-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-label="Kanhaa home"
          >
            <i className="fas fa-store text-blue-600 text-xl" aria-hidden="true"></i>
            <h1 className="text-lg font-semibold text-gray-900">Kanhaa</h1>
          </Link>
          <div className="flex items-center space-x-3">
            <UserMenu />
            <Link
              href="/cart"
              className="relative rounded p-2 text-gray-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              aria-label="View cart"
              data-testid="button-cart"
            >
              <i className="fas fa-shopping-cart text-lg" aria-hidden="true"></i>
              <span className="sr-only">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center" data-testid="text-cart-count">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
