import { useCart } from "@/hooks/use-cart";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [location, setLocation] = useLocation();
  const { cartItems } = useCart();
  
  const cartCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setLocation("/")}>
            <i className="fas fa-store text-blue-600 text-xl"></i>
            <h1 className="text-lg font-semibold text-gray-900">SimpleStore</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setLocation("/cart")}
              className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
              data-testid="button-cart"
            >
              <i className="fas fa-shopping-cart text-lg"></i>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center" data-testid="text-cart-count">
                  {cartCount}
                </span>
              )}
            </button>
            <div className="hidden md:flex space-x-2">
              <Button
                variant={location === "/admin" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLocation("/admin")}
                data-testid="button-admin"
              >
                Admin
              </Button>
              <Button
                variant={location === "/influencer" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLocation("/influencer")}
                data-testid="button-influencer"
              >
                Influencer
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
