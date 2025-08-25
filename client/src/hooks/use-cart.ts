import { useQuery, useMutation } from "@tanstack/react-query";
import { CartItemWithProduct } from "@/lib/types";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useCart() {
  const { data: cartItems, isLoading, error } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
    refetchOnWindowFocus: false,
  });

  const subtotal = cartItems?.reduce((sum, item) => {
    return sum + (parseFloat(item.product.price) * item.quantity);
  }, 0) || 0;

  const itemCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const clearCart = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/cart/clear"),
    onSuccess: () => {
      // Immediately update cache to show empty cart
      queryClient.setQueryData(["/api/cart"], []);
      // Also invalidate to refresh from server
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  return {
    cartItems: cartItems || [],
    isLoading,
    error,
    subtotal,
    itemCount,
    clearCart,
  };
}
