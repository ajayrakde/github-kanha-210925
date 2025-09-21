import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/lib/types";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Plus, Minus } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { cartItems, addToCart, updateCartItem, removeFromCart } = useCart();

  const cartItem = cartItems?.find(item => item.productId === product.id);
  const isInCart = !!cartItem;
  const cartQuantity = cartItem?.quantity || 0;

  const handleIncreaseQuantity = () => {
    if (cartItem && cartItem.quantity < 10) {
      updateCartItem.mutate({
        productId: product.id,
        quantity: cartItem.quantity + 1
      });
    }
  };

  const handleDecreaseQuantity = () => {
    if (cartItem) {
      if (cartItem.quantity === 1) {
        removeFromCart.mutate(product.id);
      } else {
        updateCartItem.mutate({
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
        onClick={() => {
          // Save scroll position before navigation
          sessionStorage.setItem('productsScrollPosition', window.scrollY.toString());
          navigate(`/product/${product.id}`);
        }}
      >
        <img
          src={product.displayImageUrl || product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`}
          alt={product.name}
          className="w-full h-44 object-cover"
          data-testid={`product-image-${product.id}`}
        />
        <div className="p-4">
          <h3 className="font-medium text-gray-900 mb-2 hover:text-blue-600" data-testid={`product-name-${product.id}`}>
            {product.name}
          </h3>
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
                  disabled={updateCartItem.isPending || removeFromCart.isPending}
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
                  disabled={updateCartItem.isPending || cartQuantity >= 10}
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
                  addToCart.mutate({
                    productId: product.id,
                    quantity: 1,
                    product: product
                  });
                }}
                disabled={addToCart.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-sm px-3 py-1.5 h-8"
                data-testid={`button-add-to-cart-${product.id}`}
              >
                Add to Cart
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
