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
    <div className="relative py-3" data-testid={`cart-item-${item.id}`}>
      {/* Cart Item Content - Horizontal Distribution: 15% image, 70% name/price, 15% quantity controls */}
      <div className="flex items-center gap-2 bg-white">
        {/* Product Image - 15% width, square (3:3 ratio) */}
        <div className="w-[15%] flex-shrink-0">
          <img
            src={item.product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&h=80`}
            alt={item.product.name}
            className="w-full aspect-square object-cover rounded border border-gray-200"
          />
        </div>

        {/* Product Name & Price - 70% width, top-left aligned */}
        <div className="w-[70%] flex-shrink-0 flex flex-col justify-start">
          <h4 className="font-semibold text-sm sm:text-base text-gray-900 leading-tight mb-0.5 line-clamp-2" data-testid={`cart-item-name-${item.id}`}>
            {item.product.name}
          </h4>
          <p className="text-xs sm:text-sm text-gray-600" data-testid={`cart-item-price-${item.id}`}>
            ₹{parseFloat(item.product.price).toFixed(2)}
          </p>
        </div>

        {/* Quantity Controls - 15% width, 3:1 ratio buttons (0.9:1.2:0.9) */}
        <div className="w-[15%] flex-shrink-0 flex items-center justify-end gap-0.5">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={updateQuantityMutation.isPending}
            className="w-[26px] h-[26px] min-w-[26px] min-h-[26px] max-w-[26px] max-h-[26px] flex-shrink-0 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-all focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 active:bg-gray-100 active:ring-2 active:ring-primary/30 disabled:opacity-50 p-0"
            data-testid={`button-decrease-${item.id}`}
          >
            <i className="fas fa-minus text-[8px]"></i>
          </button>
          <span className="w-[32px] h-[32px] min-w-[32px] min-h-[32px] max-w-[32px] max-h-[32px] flex-shrink-0 flex items-center justify-center text-xs font-medium border-y border-gray-300 bg-gray-50" data-testid={`cart-item-quantity-${item.id}`}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(1)}
            disabled={updateQuantityMutation.isPending}
            className="w-[26px] h-[26px] min-w-[26px] min-h-[26px] max-w-[26px] max-h-[26px] flex-shrink-0 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-all focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 active:bg-gray-100 active:ring-2 active:ring-primary/30 disabled:opacity-50 p-0"
            data-testid={`button-increase-${item.id}`}
          >
            <i className="fas fa-plus text-[8px]"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
