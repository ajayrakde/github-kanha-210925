import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useCart } from "@/hooks/use-cart";
import CartItem from "@/components/cart/cart-item";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Package } from "lucide-react";

export interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const { cartItems, subtotal, isLoading } = useCart();
  const [, setLocation] = useLocation();

  const handleCheckout = () => {
    onOpenChange(false);
    setLocation("/cart");
  };

  const handleContinueShopping = () => {
    onOpenChange(false);
  };

  const totalItems = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Your Cart"
      description={totalItems > 0 ? `${totalItems} ${totalItems === 1 ? "item" : "items"}` : undefined}
      height="full"
      showHandle={true}
      showClose={true}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : cartItems?.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full px-6 py-12">
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Package size={40} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h3>
          <p className="text-sm text-gray-600 text-center mb-6">
            Add some delicious snacks to get started!
          </p>
          <Button
            onClick={handleContinueShopping}
            className="w-full max-w-xs"
            data-testid="button-continue-shopping-drawer"
          >
            Continue Shopping
          </Button>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Cart Items - Scrollable */}
          <div className="flex-1 overflow-y-auto px-4 divide-y">
            {cartItems.map((item) => (
              <CartItem key={item.id} item={item} />
            ))}
          </div>

          {/* Cart Summary - Fixed at bottom */}
          <div className="border-t bg-white px-4 py-4 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium" data-testid="text-subtotal-drawer">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Delivery</span>
                <span className="text-sm text-gray-500">Calculated at checkout</span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-2 border-t">
                <span>Total</span>
                <span data-testid="text-total-drawer">₹{subtotal.toFixed(2)}</span>
              </div>
            </div>

            <Button
              onClick={handleCheckout}
              className="w-full"
              size="lg"
              data-testid="button-checkout-drawer"
            >
              Proceed to Checkout
            </Button>
            
            <button
              onClick={handleContinueShopping}
              className="w-full text-sm text-gray-600 hover:text-gray-900 transition-colors py-2"
              data-testid="button-continue-shopping-drawer-text"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

export default CartDrawer;
