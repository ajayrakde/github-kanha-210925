import { Link } from "wouter";

import { useCart } from "@/hooks/use-cart";
import UserMenu from "./user-menu";

export default function Header() {
  const { itemCount } = useCart();

  const cartCount = itemCount;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="container px-3 py-1.5 md:py-3">
        <nav className="flex items-center justify-between" aria-label="Primary navigation">
          <Link
            href="/"
            className="group flex items-center gap-1.5 sm:gap-2 md:gap-3 rounded-full px-1.5 sm:px-2 py-0.5 md:py-1 transition-transform hover:no-underline focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1"
            aria-label="Kanhaa home"
          >
            <span className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-full bg-secondary text-primary shadow-sm transition-transform group-hover:-translate-y-0.5">
              <i className="fas fa-store text-sm md:text-base" aria-hidden="true"></i>
            </span>
            <div className="rounded-md px-1 leading-tight text-primary transition-all duration-200 group-hover:bg-secondary/15 group-hover:text-secondary">
              <h1 className="text-sm md:text-lg font-bold transition-all duration-200">Kanhaa</h1>
              <span className="hidden sm:inline text-[10px] text-muted-foreground transition-all duration-200 group-hover:text-secondary">
                Snacks &amp; treats
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 md:gap-2">
            <UserMenu />
            <Link
              href="/cart"
              className="relative flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-secondary text-primary shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1"
              aria-label="View cart"
              data-testid="button-cart"
            >
              <i className="fas fa-shopping-cart text-sm md:text-base" aria-hidden="true"></i>
              <span className="sr-only">Cart</span>
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-tertiary text-[10px] font-bold text-white shadow-sm"
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
