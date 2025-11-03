import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CartItemWithProduct } from "@/lib/types";
import { haptic } from "@/lib/haptic-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    <div className="relative py-3 px-2 sm:px-4" data-testid={`cart-item-${item.id}`}>
      {/* Cart Item Content - Horizontal Distribution: 14% image, 68% name/price, 18% quantity controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 bg-white">
        {/* Product Image - 14% width, square (3:3 ratio) */}
        <div className="w-[14%] flex-shrink-0">
          <img
            src={item.product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&h=80`}
            alt={item.product.name}
            className="w-full aspect-square object-cover rounded border border-gray-200"
          />
        </div>

        {/* Product Name & Price - 68% width, top-left aligned */}
        <div className="w-[68%] flex-shrink-0 flex flex-col justify-start pr-1 sm:pr-2 min-w-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <h4 
                  className="text-xs sm:text-sm text-gray-900 leading-tight mb-0.5 truncate cursor-default" 
                  data-testid={`cart-item-name-${item.id}`}
                  aria-label={item.product.name}
                >
                  {item.product.name}
                </h4>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{item.product.name}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <p className="text-[11px] sm:text-xs text-gray-600 truncate" data-testid={`cart-item-price-${item.id}`}>
            ₹{parseFloat(item.product.price).toFixed(2)}
          </p>
        </div>

        {/* Quantity Controls - 18% width, normalized stepper design */}
        <div className="w-[18%] flex-shrink-0 flex items-center justify-end">
          <div className="flex items-center bg-primary hover:bg-primary/90 rounded-md h-7 w-[84px] transition-all duration-200 border border-transparent box-border overflow-visible relative focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-1 focus-within:ring-offset-transparent">
            <button
              type="button"
              className="h-full w-[25px] flex-none rounded-l-md bg-white/0 hover:bg-white/20 flex items-center justify-center transition-colors outline-none active:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleQuantityChange(-1)}
              disabled={updateQuantityMutation.isPending}
              aria-label="Decrease quantity"
              data-testid={`button-decrease-${item.id}`}
            >
              <i className="fas fa-minus text-[9px] text-white"></i>
            </button>
            <span className="w-[34px] text-center font-semibold text-xs text-white" data-testid={`cart-item-quantity-${item.id}`}>
              {item.quantity}
            </span>
            <button
              type="button"
              className="h-full w-[25px] flex-none rounded-r-md bg-white/0 hover:bg-white/20 flex items-center justify-center transition-colors outline-none active:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleQuantityChange(1)}
              disabled={updateQuantityMutation.isPending}
              aria-label="Increase quantity"
              data-testid={`button-increase-${item.id}`}
            >
              <i className="fas fa-plus text-[9px] text-white"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
