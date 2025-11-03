import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CartItemWithProduct } from "@/lib/types";
import { haptic } from "@/lib/haptic-utils";

interface CartItemProps {
  item: CartItemWithProduct;
}

export default function CartItem({ item }: CartItemProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateQuantityMutation = useMutation({
    mutationFn: async (newQuantity: number) => {
      if (newQuantity <= 0) {
        const response = await apiRequest("DELETE", `/api/cart/${item.productId}`);
        return await response.json();
      } else {
        const response = await apiRequest("PATCH", `/api/cart/${item.productId}`, {
          quantity: newQuantity,
        });
        return await response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update cart item",
        variant: "destructive",
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/cart/${item.productId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Item removed",
        description: `${item.product.name} has been removed from your cart`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item from cart",
        variant: "destructive",
      });
    },
  });

  const handleQuantityChange = (delta: number) => {
    const newQuantity = item.quantity + delta;
    haptic.tap(); // Light haptic for quantity change
    updateQuantityMutation.mutate(newQuantity);
  };

  return (
    <div className="relative py-3 px-3 sm:px-4" data-testid={`cart-item-${item.id}`}>
      {/* Cart Item: Fixed 60px Thumbnail | Flexible Text | Fixed Controls */}
      <div className="flex items-center gap-3 bg-white">
        {/* Product Image - Fixed 60px square */}
        <div className="w-[60px] h-[60px] flex-shrink-0">
          <img
            src={item.product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=60&h=60`}
            alt={item.product.name}
            className="w-full h-full object-cover rounded border border-gray-300"
          />
        </div>

        {/* Product Name & Price - Flexible width with proper truncation */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <h4 className="text-sm font-medium text-gray-900 leading-snug line-clamp-2 break-words" data-testid={`cart-item-name-${item.id}`}>
            {item.product.name}
          </h4>
          <p className="text-sm text-gray-700 font-semibold" data-testid={`cart-item-price-${item.id}`}>
            ₹{parseFloat(item.product.price).toFixed(2)}
          </p>
        </div>

        {/* Quantity Controls - Touch-friendly 44x44px minimum */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={updateQuantityMutation.isPending}
            className="w-9 h-9 flex-shrink-0 rounded-md border-2 border-gray-400 bg-white hover:bg-gray-50 flex items-center justify-center transition-all active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`button-decrease-${item.id}`}
            aria-label="Decrease quantity"
          >
            <i className="fas fa-minus text-xs text-gray-700"></i>
          </button>
          <span className="w-10 h-9 flex-shrink-0 flex items-center justify-center text-base font-semibold text-gray-900" data-testid={`cart-item-quantity-${item.id}`}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(1)}
            disabled={updateQuantityMutation.isPending}
            className="w-9 h-9 flex-shrink-0 rounded-md border-2 border-gray-400 bg-white hover:bg-gray-50 flex items-center justify-center transition-all active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`button-increase-${item.id}`}
            aria-label="Increase quantity"
          >
            <i className="fas fa-plus text-xs text-gray-700"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
