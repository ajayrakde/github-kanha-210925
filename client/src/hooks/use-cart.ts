import { useQuery } from "@tanstack/react-query";
import { CartItemWithProduct } from "@/lib/types";

export function useCart() {
  const { data: cartItems, isLoading, error } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
    refetchOnWindowFocus: false,
  });

  const subtotal = cartItems?.reduce((sum, item) => {
    return sum + (parseFloat(item.product.price) * item.quantity);
  }, 0) || 0;

  const itemCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return {
    cartItems: cartItems || [],
    isLoading,
    error,
    subtotal,
    itemCount,
  };
}
