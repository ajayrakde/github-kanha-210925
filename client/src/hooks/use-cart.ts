import { useQuery, useMutation } from "@tanstack/react-query";
import { CartItemWithProduct } from "@/lib/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useCart() {
  const { toast } = useToast();
  
  const { data: cartItems, isLoading, error } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
    refetchOnWindowFocus: false,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  const subtotal = cartItems?.reduce((sum, item) => {
    return sum + (parseFloat(item.product.price) * item.quantity);
  }, 0) || 0;

  const itemCount = cartItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  // Optimized addToCart mutation with optimistic updates
  const addToCart = useMutation({
    mutationFn: async ({ productId, quantity = 1, product }: { productId: string; quantity?: number; product?: any }) => {
      const response = await apiRequest("POST", "/api/cart/add", { productId, quantity });
      return response.json();
    },
    onMutate: async ({ productId, quantity = 1, product }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/cart"] });
      
      // Snapshot previous value
      const previousCart = queryClient.getQueryData<CartItemWithProduct[]>(["/api/cart"]);
      
      // Optimistically update cart
      if (previousCart && product) {
        const existingItemIndex = previousCart.findIndex(item => item.productId === productId);
        let newCart: CartItemWithProduct[];
        
        if (existingItemIndex >= 0) {
          // Update existing item
          newCart = [...previousCart];
          newCart[existingItemIndex] = {
            ...newCart[existingItemIndex],
            quantity: newCart[existingItemIndex].quantity + quantity
          };
        } else {
          // Add new item
          const newItem: CartItemWithProduct = {
            id: `temp-${Date.now()}`, // Temporary ID
            sessionId: "temp",
            productId,
            quantity,
            product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          newCart = [...previousCart, newItem];
        }
        
        queryClient.setQueryData(["/api/cart"], newCart);
      }
      
      return { previousCart };
    },
    onError: (err, variables, context) => {
      // Rollback optimistic update
      if (context?.previousCart) {
        queryClient.setQueryData(["/api/cart"], context.previousCart);
      }
      toast({
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // Refetch to get correct server state
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  // Optimized updateCartItem mutation
  const updateCartItem = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const response = await apiRequest("PATCH", `/api/cart/${productId}`, { quantity });
      return response.json();
    },
    onMutate: async ({ productId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/cart"] });
      
      const previousCart = queryClient.getQueryData<CartItemWithProduct[]>(["/api/cart"]);
      
      if (previousCart) {
        const newCart = previousCart.map(item =>
          item.productId === productId 
            ? { ...item, quantity }
            : item
        );
        queryClient.setQueryData(["/api/cart"], newCart);
      }
      
      return { previousCart };
    },
    onError: (err, variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["/api/cart"], context.previousCart);
      }
      toast({
        title: "Error",
        description: "Failed to update cart item",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  // Optimized removeFromCart mutation
  const removeFromCart = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest("DELETE", `/api/cart/${productId}`);
      return response.json();
    },
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/cart"] });
      
      const previousCart = queryClient.getQueryData<CartItemWithProduct[]>(["/api/cart"]);
      
      if (previousCart) {
        const newCart = previousCart.filter(item => item.productId !== productId);
        queryClient.setQueryData(["/api/cart"], newCart);
      }
      
      return { previousCart };
    },
    onError: (err, productId, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["/api/cart"], context.previousCart);
      }
      toast({
        title: "Error",
        description: "Failed to remove item from cart",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const clearCart = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/cart/clear"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/cart"] });
      const previousCart = queryClient.getQueryData<CartItemWithProduct[]>(["/api/cart"]);
      queryClient.setQueryData(["/api/cart"], []);
      return { previousCart };
    },
    onError: (err, variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["/api/cart"], context.previousCart);
      }
      toast({
        title: "Error", 
        description: "Failed to clear cart",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  return {
    cartItems: cartItems || [],
    isLoading,
    error,
    subtotal,
    itemCount,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
  };
}
