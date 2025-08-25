import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ProductCard from "@/components/product/product-card";
import { ApiErrorMessage } from "@/components/ui/error-message";
import { Button } from "@/components/ui/button";
import { Product, CartItemWithProduct } from "@/lib/types";

export default function Products() {
  const [, navigate] = useLocation();
  
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Get cart data to show proceed to checkout button
  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="w-full h-48 bg-gray-200 animate-pulse"></div>
              <div className="p-4 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                <div className="flex items-center justify-between">
                  <div className="h-6 bg-gray-200 rounded w-20 animate-pulse"></div>
                  <div className="h-10 bg-gray-200 rounded w-24 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Our Products</h2>
          <p className="text-gray-600">Discover our carefully curated collection</p>
        </div>
        <ApiErrorMessage error={error as Error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Our Products</h2>
        <p className="text-gray-600">Discover our carefully curated collection</p>
        
        {/* Proceed to Checkout Button - shown when cart has items */}
        {cartItems && cartItems.length > 0 && (
          <div className="mt-4">
            <Button
              onClick={() => navigate('/checkout')}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="lg"
              data-testid="button-proceed-checkout-top"
            >
              Proceed to Checkout ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} items)
            </Button>
          </div>
        )}
      </div>

      {!products || products.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">No products available at the moment</div>
          <p className="text-gray-400 mt-2">Please check back later</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
