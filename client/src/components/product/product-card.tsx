import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import ProductDetailsModal from "./product-details-modal";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
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
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      apiRequest("PATCH", `/api/cart/${productId}`, { quantity }),
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
    mutationFn: (productId: string) => apiRequest("DELETE", `/api/cart/${productId}`),
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
    if (cartItem && cartItem.quantity < 10) {
      updateCartMutation.mutate({
        productId: product.id,
        quantity: cartItem.quantity + 1
      });
    }
  };

  const handleDecreaseQuantity = () => {
    if (cartItem) {
      if (cartItem.quantity === 1) {
        removeFromCartMutation.mutate(product.id);
      } else {
        updateCartMutation.mutate({
          productId: product.id,
          quantity: cartItem.quantity - 1
        });
      }
    }
  };

  return (
    <>
      <div 
        className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden cursor-pointer" 
        data-testid={`product-card-${product.id}`}
        onClick={() => setShowDetails(true)}
      >
        <img
          src={product.displayImageUrl || product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`}
          alt={product.name}
          className="w-full h-48 object-cover"
          data-testid={`product-image-${product.id}`}
        />
        <div className="p-4">
          <h3 className="font-medium text-gray-900 mb-2 hover:text-blue-600" data-testid={`product-name-${product.id}`}>
            {product.name}
          </h3>
          <div data-testid={`product-description-${product.id}`}>
            <MarkdownRenderer
              content={product.description || ''}
              compact
              className="mb-3"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-lg font-semibold text-gray-900" data-testid={`product-price-${product.id}`}>
              ₹{parseFloat(product.price).toFixed(2)}
            </span>
            
            {cartQuantity > 0 ? (
              <div 
                className="flex items-center gap-1 border rounded-md" 
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDecreaseQuantity();
                  }}
                  disabled={updateCartMutation.isPending || removeFromCartMutation.isPending}
                  className="h-8 w-8 p-0"
                  data-testid={`button-decrease-quantity-${product.id}`}
                >
                  <Minus size={14} />
                </Button>
                <span className="px-2 py-1 text-sm font-medium min-w-[24px] text-center" data-testid={`cart-quantity-${product.id}`}>
                  {cartQuantity}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIncreaseQuantity();
                  }}
                  disabled={updateCartMutation.isPending || cartQuantity >= 10}
                  className="h-8 w-8 p-0"
                  data-testid={`button-increase-quantity-${product.id}`}
                >
                  <Plus size={14} />
                </Button>
              </div>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  addToCartMutation.mutate();
                }}
                disabled={addToCartMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-sm px-3 py-1.5 h-8"
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
