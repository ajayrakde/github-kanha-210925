import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import ProductDetailsModal from "./product-details-modal";
import { Plus, Minus } from "lucide-react";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cart/add", {
        productId: product.id,
        quantity: 1,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    },
  });

  const updateCartMutation = useMutation({
    mutationFn: ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) =>
      apiRequest("PATCH", `/api/cart/${cartItemId}`, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      console.error('Update cart error:', error);
      toast({
        title: "Error",
        description: "Failed to update cart",
        variant: "destructive",
      });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (cartItemId: string) => apiRequest("DELETE", `/api/cart/${cartItemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      console.error('Remove from cart error:', error);
      toast({
        title: "Error",
        description: "Failed to remove from cart",
        variant: "destructive",
      });
    },
  });

  const cartItem = cartItems?.find(item => item.productId === product.id);
  const isInCart = !!cartItem;
  const cartQuantity = cartItem?.quantity || 0;

  const handleIncreaseQuantity = () => {
    if (cartItem) {
      updateCartMutation.mutate({
        cartItemId: cartItem.id,
        quantity: cartItem.quantity + 1
      });
    }
  };

  const handleDecreaseQuantity = () => {
    if (cartItem) {
      if (cartItem.quantity === 1) {
        removeFromCartMutation.mutate(cartItem.id);
      } else {
        updateCartMutation.mutate({
          cartItemId: cartItem.id,
          quantity: cartItem.quantity - 1
        });
      }
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden" data-testid={`product-card-${product.id}`}>
        <img
          src={product.displayImageUrl || product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`}
          alt={product.name}
          className="w-full h-48 object-cover cursor-pointer"
          onClick={() => setShowDetails(true)}
          data-testid={`product-image-${product.id}`}
        />
        <div className="p-4">
          <h3 
            className="font-medium text-gray-900 mb-2 cursor-pointer hover:text-blue-600" 
            data-testid={`product-name-${product.id}`}
            onClick={() => setShowDetails(true)}
          >
            {product.name}
          </h3>
          <p className="text-sm text-gray-600 mb-3" data-testid={`product-description-${product.id}`}>
            {product.description || 'No description available'}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-900" data-testid={`product-price-${product.id}`}>
              ₹{parseFloat(product.price).toFixed(2)}
            </span>
            
            {isInCart ? (
              <div className="flex items-center gap-2 border rounded-lg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDecreaseQuantity}
                  disabled={updateCartMutation.isPending || removeFromCartMutation.isPending}
                  data-testid={`button-decrease-quantity-${product.id}`}
                >
                  <Minus size={16} />
                </Button>
                <span className="px-3 py-2 font-medium" data-testid={`cart-quantity-${product.id}`}>
                  {cartQuantity}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleIncreaseQuantity}
                  disabled={updateCartMutation.isPending}
                  data-testid={`button-increase-quantity-${product.id}`}
                >
                  <Plus size={16} />
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => addToCartMutation.mutate()}
                disabled={addToCartMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid={`button-add-to-cart-${product.id}`}
              >
                Add to Cart
              </Button>
            )}
          </div>
        </div>
      </div>

      <ProductDetailsModal
        product={product}
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
      />
    </>
  );
}
