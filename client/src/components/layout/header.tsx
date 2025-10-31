import { Link } from "wouter";

import { useCart } from "@/hooks/use-cart";
import UserMenu from "./user-menu";

export default function Header() {
  const { itemCount } = useCart();

  const cartCount = itemCount;

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md shadow-sm">
      <div className="container py-4">
        <nav className="flex items-center justify-between" aria-label="Primary navigation">
          <Link
            href="/"
            className="group flex items-center gap-3 rounded-full px-3 py-2 transition-transform hover:no-underline focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-label="Kanhaa home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary shadow-md transition-transform group-hover:-translate-y-1">
              <i className="fas fa-store text-lg" aria-hidden="true"></i>
            </span>
            <div className="rounded-lg px-2 py-1 leading-tight text-primary transition-all duration-200 group-hover:bg-secondary/15 group-hover:text-secondary group-focus-visible:bg-secondary/20 group-focus-visible:text-secondary">
              <h1 className="text-xl font-bold transition-all duration-200">Kanhaa</h1>
              <span className="text-xs text-muted-foreground transition-all duration-200 group-hover:text-secondary group-focus-visible:text-secondary">
                Playful snacks &amp; treats
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">Brighten snack time today!</span>
            <UserMenu />
            <Link
              href="/cart"
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary shadow-md transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              aria-label="View cart"
              data-testid="button-cart"
            >
              <i className="fas fa-shopping-cart text-lg" aria-hidden="true"></i>
              <span className="sr-only">Cart</span>
              {cartCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-tertiary text-xs font-semibold text-white shadow"
                  data-testid="text-cart-count"
                >
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
