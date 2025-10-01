import { useQuery } from "@tanstack/react-query";
import ProductCard from "@/components/product/product-card";
import { ApiErrorMessage } from "@/components/ui/error-message";
import { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";

export default function Products() {
  const [, setLocation] = useLocation();
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  
  const { cartItems, itemCount, subtotal } = useCart();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <header className="mb-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
        </header>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
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
        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Our Products</h1>
          <p className="text-gray-600">Discover our carefully curated collection</p>
        </header>
        <ApiErrorMessage error={error as Error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Checkout Proceed Element - appears at top when cart has items */}
      {itemCount > 0 && (
        <div className="sticky top-20 z-10 bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg shadow-lg border-2 border-green-400">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-full">
                <ShoppingCart size={20} />
              </div>
              <div>
                <div className="font-semibold">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} in cart
                </div>
                <div className="text-green-100 text-sm">
                  Total: ₹{subtotal.toFixed(2)} (+ ₹50 shipping)
                </div>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/checkout")}
              className="bg-white text-green-600 hover:bg-green-50 font-semibold px-6 py-2 rounded-lg shadow-sm transition-all duration-200 hover:scale-105"
              data-testid="button-proceed-checkout"
            >
              Proceed to Checkout
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </div>
      )}
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Our Products</h1>
        <p className="text-gray-600">Discover our carefully curated collection</p>
      </header>

      {!products || products.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">No products available at the moment</div>
          <p className="text-gray-400 mt-2">Please check back later</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
