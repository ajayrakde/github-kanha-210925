import { ShoppingCart, ChevronRight } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface StickyCartBarProps {
  onClick?: () => void;
  className?: string;
}

export function StickyCartBar({ onClick, className }: StickyCartBarProps) {
  const { cartItems } = useCart();
  const [shouldBounce, setShouldBounce] = useState(false);
  const prevItemCount = useRef(0);

  const totalItems = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalPrice = cartItems?.reduce((sum, item) => sum + (parseFloat(item.product.price) * item.quantity), 0) || 0;

  useEffect(() => {
    if (totalItems > prevItemCount.current && prevItemCount.current > 0) {
      setShouldBounce(true);
      setTimeout(() => setShouldBounce(false), 500);
    }
    prevItemCount.current = totalItems;
  }, [totalItems]);

  if (totalItems === 0) return null;

  return (
    <div
      id="sticky-cart-bar"
      className={cn(
        "md:hidden fixed bottom-16 left-0 right-0 z-50 px-4 py-2",
        className
      )}
      data-testid="sticky-cart-bar"
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full bg-primary text-primary-foreground rounded-full shadow-lg px-5 py-3.5 flex items-center justify-between transition-all duration-200 active:scale-98",
          shouldBounce && "animate-bounce"
        )}
        data-testid="button-view-cart-mobile"
        aria-label={`View cart with ${totalItems} items`}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingCart size={20} strokeWidth={2} />
            <span className="absolute -top-2 -right-2 bg-white text-primary text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalItems}
            </span>
          </div>
          <span className="font-semibold text-sm">
            {totalItems} {totalItems === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">
            ₹{totalPrice.toFixed(2)}
          </span>
          <ChevronRight size={20} strokeWidth={2.5} />
        </div>
      </button>
    </div>
  );
}

export default StickyCartBar;
