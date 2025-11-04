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

  const controlBaseClasses =
    "w-[76px] h-11 md:w-[88px] md:h-8 !min-w-[76px] md:!min-w-[88px] rounded-md bg-primary hover:bg-primary/90 text-white transition-all duration-200 border border-transparent box-border font-semibold text-[11px] md:text-xs outline-none active:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed";
  const controlFocusRingClasses =
    "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

  return (
    <div
      className="card group cursor-pointer"
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
      <div className="pt-1.5 pb-0.5 px-1 space-y-0.5" onClick={handleCardNavigation}>
        <h3 className="text-xs font-normal text-gray-900 leading-tight line-clamp-2 min-h-[2.4rem]" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        
        <div className="flex items-center gap-1.5 -mx-1 px-1">
          <span className="text-sm font-bold text-gray-900" data-testid={`product-price-${product.id}`}>
            ₹{parseFloat(product.price).toFixed(2)}
          </span>
          
          {/* Minimal add button - responsive dimensions */}
          <div onClick={(e) => e.stopPropagation()} className="ml-auto w-[76px] h-11 md:w-[88px] md:h-8 !min-w-[76px] md:!min-w-[88px]">
            {cartQuantity > 0 ? (
              <div
                className={`${controlBaseClasses} flex items-center md:gap-0 relative focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-1 focus-within:ring-offset-transparent`}
              >
                <button
                  type="button"
                  className="flex-1 md:w-[24px] h-full p-0 min-h-0 rounded-l-md bg-white/0 hover:bg-white/20 flex items-center justify-center transition-colors outline-none active:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl md:text-base font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDecreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || removeFromCart.isPending}
                  data-testid={`button-decrease-quantity-${product.id}`}
                  aria-label={`Decrease quantity of ${product.name}`}
                >
                  −
                </button>
                <span
                  className="flex-1 md:w-[28px] text-center font-semibold text-sm md:text-xs text-white flex items-center justify-center"
                  data-testid={`cart-quantity-${product.id}`}
                >
                  {cartQuantity}
                </span>
                <button
                  type="button"
                  className="flex-1 md:w-[24px] h-full p-0 min-h-0 rounded-r-md bg-white/0 hover:bg-white/20 flex items-center justify-center transition-colors outline-none active:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl md:text-base font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIncreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || cartQuantity >= 10}
                  data-testid={`button-increase-quantity-${product.id}`}
                  aria-label={`Increase quantity of ${product.name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${controlBaseClasses} ${controlFocusRingClasses} flex items-center justify-center`}
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
