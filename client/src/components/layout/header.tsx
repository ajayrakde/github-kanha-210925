import { Link } from "wouter";
import { Heart } from "lucide-react";

import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-300">
      <div className="container px-3 py-2 md:py-3">
        <nav className="flex items-center justify-between" aria-label="Primary navigation">
          <Link
            href="/"
            className="group flex items-center gap-2 md:gap-3 rounded-lg px-2 py-2 md:py-1 transition-all hover:no-underline hover:bg-gray-50 focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 min-h-[44px]"
            aria-label="Kanhaa home"
          >
            <span className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-secondary text-primary border-2 border-secondary/30 transition-transform group-hover:scale-105">
              <i className="fas fa-store text-base md:text-lg" aria-hidden="true"></i>
            </span>
            <div className="leading-tight text-primary">
              <h1 className="text-base md:text-lg font-bold text-gray-900">Kanhaa</h1>
              <span className="hidden sm:inline text-xs text-gray-700 font-medium">
                Snacks &amp; treats
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <UserMenu />
            <button
              className="relative flex h-11 w-11 md:h-11 md:w-11 items-center justify-center rounded-lg bg-secondary text-primary border-2 border-secondary/30 transition-all hover:scale-105 hover:border-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              aria-label="Favorites"
              data-testid="button-favorites"
            >
              <Heart size={20} className="md:w-5 md:h-5" strokeWidth={2.5} />
              <span className="sr-only">Favorites</span>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
