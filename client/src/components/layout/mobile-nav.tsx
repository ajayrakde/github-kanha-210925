import { useState } from "react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import UserDrawer from "./user-drawer";

export default function MobileNav() {
  const [location, setLocation] = useLocation();
  const { itemCount } = useCart();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Customer-only navigation items (no admin/influencer)
  const navItems = [
    { type: "drawer", icon: "fas fa-user", label: "User" },
    { path: "/", icon: "fas fa-home", label: "Home" },
    { path: "/cart", icon: "fas fa-shopping-cart", label: "Cart" },
  ];

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.type === "drawer") {
      setIsDrawerOpen(!isDrawerOpen);
    } else if (item.path) {
      setIsDrawerOpen(false);
      setLocation(item.path);
    }
  };

  return (
    <>
      <UserDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50"
        aria-label="Mobile navigation"
      >
        <div className="flex justify-around px-1 py-1">
          {navItems.map((item, index) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              className={`relative flex items-center justify-center min-w-[48px] h-12 transition-all rounded ${
                item.path && location === item.path 
                  ? 'text-primary bg-secondary/25' 
                  : 'text-gray-600 hover:text-primary hover:bg-gray-50 active:bg-gray-100'
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
              aria-label={item.label}
              aria-current={item.path && location === item.path ? 'page' : undefined}
            >
              <i className={`${item.icon} text-xl`} aria-hidden="true"></i>
              {item.path === "/cart" && itemCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-white shadow-md"
                  style={{
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.1)'
                  }}
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
    </>
  );
}
