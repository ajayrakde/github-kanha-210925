import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden" data-testid={`product-card-${product.id}`}>
      <img
        src={product.displayImageUrl || product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`}
        alt={product.name}
        className="w-full h-48 object-cover"
      />
      <div className="p-4">
        <h3 className="font-medium text-gray-900 mb-2" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        <p className="text-sm text-gray-600 mb-3" data-testid={`product-description-${product.id}`}>
          {product.description || 'No description available'}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900" data-testid={`product-price-${product.id}`}>
            ₹{parseFloat(product.price).toFixed(2)}
          </span>
          <Button
            onClick={() => addToCartMutation.mutate()}
            disabled={addToCartMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid={`button-add-to-cart-${product.id}`}
          >
            Add to Cart
          </Button>
        </div>
      </div>
    </div>
  );
}
