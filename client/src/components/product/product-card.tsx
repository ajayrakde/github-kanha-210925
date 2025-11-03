import { Product } from "@/lib/types";
import { Plus, Minus } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { haptic } from "@/lib/haptic-utils";

interface ProductCardProps {
  product: Product;
  onClick?: (productId: string) => void;
}

export default function ProductCard({ product, onClick }: ProductCardProps) {
  const [, navigate] = useLocation();

  const { cartItems, addToCart, updateCartItem, removeFromCart } = useCart();

  const cartItem = cartItems?.find(item => item.productId === product.id);
  const isInCart = !!cartItem;
  const cartQuantity = cartItem?.quantity || 0;

  const tagSource = [
    isInCart ? "In your cart" : null,
    product.category,
    product.classification,
    product.brand,
  ].filter((value): value is string => Boolean(value));

  const tagLabels = Array.from(new Set(tagSource)).slice(0, 3);
  const tagPalette = ["tag--green", "tag--yellow", "tag--purple"];

  const badgeLabel =
    product.classification ||
    product.category ||
    (product.stock < 6 ? `Only ${product.stock} left` : undefined);

  const description = product.description
    ? product.description
        .replace(/[#*_`~>\[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const summary = description || product.brand || "A cheerful treat crafted for curious taste buds.";
  const displaySummary = summary.length > 120 ? `${summary.slice(0, 117)}…` : summary;

  const handleCardNavigation = () => {
    if (onClick) {
      onClick(product.id);
    } else {
      sessionStorage.setItem("productsScrollPosition", window.scrollY.toString());
      navigate(`/product/${product.id}`);
    }
  };

  const handleIncreaseQuantity = () => {
    if (cartItem && cartItem.quantity < 10) {
      haptic.add(); // Medium haptic for adding quantity
      updateCartItem.mutate({
        productId: product.id,
        quantity: cartItem.quantity + 1
      });
    }
  };

  const handleDecreaseQuantity = () => {
    if (cartItem) {
      haptic.tap(); // Light haptic for decreasing quantity
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
    <div
      className="group cursor-pointer"
      data-testid={`product-card-${product.id}`}
    >
      {/* Image Container - Minimal design */}
      <div className="relative bg-gray-50 rounded overflow-hidden border border-gray-200" onClick={handleCardNavigation}>
        {badgeLabel && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-white/95 backdrop-blur-sm text-gray-700 z-10 border border-gray-200" data-testid={`product-badge-${product.id}`}>
            {badgeLabel}
          </span>
        )}
        <img
          src={
            product.displayImageUrl ||
            product.imageUrl ||
            `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`
          }
          alt={product.name}
          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
          data-testid={`product-image-${product.id}`}
        />
      </div>

      {/* Flat Info Section - Instagram style */}
      <div className="pt-1.5 pb-0.5 space-y-0.5" onClick={handleCardNavigation}>
        <h3 className="text-xs font-normal text-gray-900 leading-tight line-clamp-2 min-h-[2.4rem]" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-900" data-testid={`product-price-${product.id}`}>
            ₹{parseFloat(product.price).toFixed(2)}
          </span>
          
          {/* Minimal add button - responsive dimensions */}
          <div onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0">
            {cartQuantity > 0 ? (
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  className="w-[20px] h-[20px] md:w-[26px] md:h-[26px] min-w-[20px] min-h-[20px] md:min-w-[26px] md:min-h-[26px] max-w-[20px] max-h-[20px] md:max-w-[26px] md:max-h-[26px] flex-shrink-0 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 active:scale-95 active:shadow-[0_0_8px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:active:scale-100 disabled:active:shadow-none p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDecreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || removeFromCart.isPending}
                  data-testid={`button-decrease-quantity-${product.id}`}
                  aria-label={`Decrease quantity of ${product.name}`}
                >
                  <Minus size={8} className="md:scale-110" />
                </button>
                <span className="w-[26px] h-[26px] md:w-[32px] md:h-[32px] min-w-[26px] min-h-[26px] md:min-w-[32px] md:min-h-[32px] max-w-[26px] max-h-[26px] md:max-w-[32px] md:max-h-[32px] flex-shrink-0 flex items-center justify-center text-[10px] md:text-xs font-medium bg-gray-50" data-testid={`cart-quantity-${product.id}`}>
                  {cartQuantity}
                </span>
                <button
                  type="button"
                  className="w-[20px] h-[20px] md:w-[26px] md:h-[26px] min-w-[20px] min-h-[20px] md:min-w-[26px] md:min-h-[26px] max-w-[20px] max-h-[20px] md:max-w-[26px] md:max-h-[26px] flex-shrink-0 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 active:scale-95 active:shadow-[0_0_8px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:active:scale-100 disabled:active:shadow-none p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIncreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || cartQuantity >= 10}
                  data-testid={`button-increase-quantity-${product.id}`}
                  aria-label={`Increase quantity of ${product.name}`}
                >
                  <Plus size={8} className="md:scale-110" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="h-5 md:h-7 w-[66px] md:w-[84px] min-w-[66px] md:min-w-[84px] max-w-[66px] md:max-w-[84px] py-0.5 rounded bg-primary hover:bg-primary/90 text-white transition-all flex items-center justify-center border border-transparent font-medium text-[10px] md:text-xs outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 active:scale-95 active:shadow-[0_0_8px_rgba(255,255,255,0.4)] disabled:opacity-50 disabled:active:scale-100 disabled:active:shadow-none"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic.add();
                  addToCart.mutate({
                    productId: product.id,
                    quantity: 1,
                    product,
                  });
                }}
                disabled={addToCart.isPending}
                data-testid={`button-add-to-cart-${product.id}`}
                aria-label={`Add ${product.name} to cart`}
              >
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
