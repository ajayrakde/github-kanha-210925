import { Link } from "wouter";
import { Heart } from "lucide-react";

import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="container px-3 py-1.5 md:py-3">
        <nav className="flex items-center justify-between" aria-label="Primary navigation">
          <Link
            href="/"
            className="group flex items-center gap-1.5 sm:gap-2 md:gap-3 rounded px-1.5 sm:px-2 py-0.5 md:py-1 transition-transform hover:no-underline focus-visible:outline-none focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1"
            aria-label="Kanhaa home"
          >
            <span className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded bg-secondary text-primary border border-secondary/20 transition-transform group-hover:-translate-y-0.5">
              <i className="fas fa-store text-sm md:text-base" aria-hidden="true"></i>
            </span>
            <div className="rounded px-1 leading-tight text-primary transition-all duration-200 group-hover:bg-secondary/15 group-hover:text-secondary">
              <h1 className="text-sm md:text-lg font-bold transition-all duration-200">Kanhaa</h1>
              <span className="hidden sm:inline text-[10px] text-muted-foreground transition-all duration-200 group-hover:text-secondary">
                Snacks &amp; treats
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 md:gap-2">
            <UserMenu />
            <button
              className="relative flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded bg-secondary text-primary border border-secondary/20 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-1"
              aria-label="Favorites"
              data-testid="button-favorites"
            >
              <Heart size={18} className="md:w-5 md:h-5" />
              <span className="sr-only">Favorites</span>
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
