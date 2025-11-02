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
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]"
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around px-2 py-1">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={`relative flex flex-col items-center justify-center min-w-[64px] min-h-[56px] transition-colors rounded-lg ${
              location === item.path 
                ? 'text-primary bg-secondary/20' 
                : 'text-gray-600 hover:text-primary hover:bg-gray-50 active:bg-gray-100'
            }`}
            data-testid={`nav-${item.label.toLowerCase()}`}
            aria-label={item.label}
            aria-current={location === item.path ? 'page' : undefined}
          >
            <i className={`${item.icon} text-xl mb-1`} aria-hidden="true"></i>
            {item.path === "/cart" && itemCount > 0 && (
              <span
                className="absolute top-1 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-tertiary text-[11px] font-bold text-white shadow-md"
                data-testid="text-cart-count-mobile"
                aria-label={`${itemCount} items in cart`}
              >
                {itemCount}
              </span>
            )}
            <span className="text-[11px] font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
