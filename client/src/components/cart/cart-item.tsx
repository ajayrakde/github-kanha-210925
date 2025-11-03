import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CartItemWithProduct } from "@/lib/types";
import { useState, useRef, useEffect, TouchEvent } from "react";
import { Trash2 } from "lucide-react";
import { haptic } from "@/lib/haptic-utils";

interface CartItemProps {
  item: CartItemWithProduct;
}

export default function CartItem({ item }: CartItemProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Swipe-to-delete state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const currentOffset = useRef(0);
  const swipeThreshold = 120; // Pixels to swipe for delete
  const deleteActionWidth = 80; // Width of delete button

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

  // Touch handlers for swipe-to-delete on mobile
  const handleTouchStart = (e: TouchEvent) => {
    if (window.innerWidth >= 768) return; // Desktop only uses buttons
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
    haptic.swipeStart(); // Light haptic feedback on swipe start
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isSwiping || window.innerWidth >= 768) return;
    
    const deltaX = touchStartX.current - e.touches[0].clientX;
    const deltaY = Math.abs(touchStartY.current - e.touches[0].clientY);
    
    // Only horizontal swipe (not vertical scroll)
    if (deltaY < 30 && deltaX > 0) {
      // Don't clamp during swipe - allow full swipe distance for threshold check
      currentOffset.current = deltaX;
      setSwipeOffset(Math.min(deltaX, deleteActionWidth)); // Visual clamping only
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping || window.innerWidth >= 768) return;
    setIsSwiping(false);
    
    if (currentOffset.current >= swipeThreshold) {
      // Swiped far enough - delete item
      haptic.delete(); // Heavy haptic for deletion
      removeItemMutation.mutate();
      setSwipeOffset(0);
      currentOffset.current = 0;
    } else if (currentOffset.current >= deleteActionWidth * 0.5) {
      // Show delete button
      haptic.swipeEnd(); // Medium haptic when delete button appears
      setSwipeOffset(deleteActionWidth);
      currentOffset.current = deleteActionWidth;
    } else {
      // Reset
      setSwipeOffset(0);
      currentOffset.current = 0;
    }
  };

  const handleDeleteClick = () => {
    haptic.delete(); // Heavy haptic for delete button tap
    removeItemMutation.mutate();
    setSwipeOffset(0);
    currentOffset.current = 0;
  };

  // Reset swipe on successful delete
  useEffect(() => {
    if (removeItemMutation.isSuccess) {
      setSwipeOffset(0);
      currentOffset.current = 0;
    }
  }, [removeItemMutation.isSuccess]);

  return (
    <div className="relative overflow-hidden" data-testid={`cart-item-${item.id}`}>
      {/* Delete Action Background (Mobile Only) */}
      <div 
        className="absolute right-0 top-0 bottom-0 md:hidden flex items-center justify-center bg-red-500 text-white"
        style={{ width: `${deleteActionWidth}px` }}
      >
        <button
          onClick={handleDeleteClick}
          className="w-full h-full flex items-center justify-center"
          disabled={removeItemMutation.isPending}
          data-testid={`button-swipe-delete-${item.id}`}
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Cart Item Content */}
      <div 
        className="flex items-center gap-2 py-3 bg-white transition-transform duration-200 ease-out min-w-0"
        style={{ 
          transform: `translateX(-${swipeOffset}px)`,
          touchAction: isSwiping ? 'none' : 'auto'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
            className="w-5 h-5 sm:w-6 sm:h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-colors disabled:opacity-50"
            data-testid={`button-decrease-${item.id}`}
          >
            <i className="fas fa-minus text-[8px]"></i>
          </button>
          <span className="w-5 sm:w-6 text-center text-xs font-medium" data-testid={`cart-item-quantity-${item.id}`}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(1)}
            disabled={updateQuantityMutation.isPending}
            className="w-5 h-5 sm:w-6 sm:h-6 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-colors disabled:opacity-50"
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
