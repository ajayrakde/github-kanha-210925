import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CartItemWithProduct } from "@/lib/types";

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
    updateQuantityMutation.mutate(newQuantity);
  };

  return (
    <div className="flex items-center space-x-4 py-4" data-testid={`cart-item-${item.id}`}>
      <img
        src={item.product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&h=80`}
        alt={item.product.name}
        className="w-16 h-16 object-cover rounded-md"
      />
      <div className="flex-1">
        <h4 className="font-medium text-gray-900" data-testid={`cart-item-name-${item.id}`}>
          {item.product.name}
        </h4>
        <p className="text-sm text-gray-600" data-testid={`cart-item-price-${item.id}`}>
          ₹{parseFloat(item.product.price).toFixed(2)}
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          className="w-8 h-8 rounded-full p-0"
          onClick={() => handleQuantityChange(-1)}
          disabled={updateQuantityMutation.isPending}
          data-testid={`button-decrease-${item.id}`}
        >
          <i className="fas fa-minus text-xs"></i>
        </Button>
        <span className="w-8 text-center" data-testid={`cart-item-quantity-${item.id}`}>
          {item.quantity}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="w-8 h-8 rounded-full p-0"
          onClick={() => handleQuantityChange(1)}
          disabled={updateQuantityMutation.isPending}
          data-testid={`button-increase-${item.id}`}
        >
          <i className="fas fa-plus text-xs"></i>
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700 p-2"
        onClick={() => removeItemMutation.mutate()}
        disabled={removeItemMutation.isPending}
        data-testid={`button-remove-${item.id}`}
      >
        <i className="fas fa-trash text-sm"></i>
      </Button>
    </div>
  );
}
