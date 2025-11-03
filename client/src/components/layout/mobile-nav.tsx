import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";

export default function MobileNav() {
  const [location, setLocation] = useLocation();
  const { itemCount } = useCart();

  // Customer-only navigation items (no admin/influencer)
  const navItems = [
    { path: "/", icon: "fas fa-home", label: "Home" },
    { path: "/cart", icon: "fas fa-shopping-cart", label: "Cart" },
    { path: "/orders", icon: "fas fa-box", label: "Orders" },
  ];

  return (
    <nav 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40"
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around px-1 py-1">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={`relative flex items-center justify-center min-w-[48px] h-12 transition-all rounded ${
              location === item.path 
                ? 'text-primary bg-secondary/25' 
                : 'text-gray-600 hover:text-primary hover:bg-gray-50 active:bg-gray-100'
            }`}
            data-testid={`nav-${item.label.toLowerCase()}`}
            aria-label={item.label}
            aria-current={location === item.path ? 'page' : undefined}
          >
            <i className={`${item.icon} text-xl`} aria-hidden="true"></i>
            {item.path === "/cart" && itemCount > 0 && (
              <span
                className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-tertiary text-[9px] font-bold text-white border border-tertiary/20"
                data-testid="text-cart-count-mobile"
                aria-label={`${itemCount} items in cart`}
              >
                {itemCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
