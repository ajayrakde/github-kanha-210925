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
    <div className="relative" data-testid={`cart-item-${item.id}`}>
      {/* Cart Item Content */}
      <div className="flex items-center gap-2 py-3 bg-white min-w-0">
        <img
          src={item.product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&h=80`}
          alt={item.product.name}
          className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded flex-shrink-0 border border-gray-200"
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm sm:text-base text-gray-900 leading-tight mb-0.5 line-clamp-2" data-testid={`cart-item-name-${item.id}`}>
            {item.product.name}
          </h4>
          <p className="text-xs sm:text-sm text-gray-600" data-testid={`cart-item-price-${item.id}`}>
            ₹{parseFloat(item.product.price).toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={updateQuantityMutation.isPending}
            className="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center quantity-btn disabled:opacity-50"
            data-testid={`button-decrease-${item.id}`}
          >
            <i className="fas fa-minus text-[8px]"></i>
          </button>
          <span className="w-6 text-center text-xs font-medium" data-testid={`cart-item-quantity-${item.id}`}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(1)}
            disabled={updateQuantityMutation.isPending}
            className="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center quantity-btn disabled:opacity-50"
            data-testid={`button-increase-${item.id}`}
          >
            <i className="fas fa-plus text-[8px]"></i>
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 hidden md:flex flex-shrink-0"
          onClick={() => removeItemMutation.mutate()}
          disabled={removeItemMutation.isPending}
          data-testid={`button-remove-${item.id}`}
        >
          <i className="fas fa-trash text-sm"></i>
        </Button>
      </div>
    </div>
  );
}
