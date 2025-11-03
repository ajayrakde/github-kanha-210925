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
      {/* Image Container - Clean, no overlays */}
      <div className="relative bg-gray-50 rounded-lg overflow-hidden" onClick={handleCardNavigation}>
        {badgeLabel && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-gray-700 z-10" data-testid={`product-badge-${product.id}`}>
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
      <div className="pt-2 pb-1 space-y-1" onClick={handleCardNavigation}>
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-gray-900" data-testid={`product-price-${product.id}`}>
            ₹{parseFloat(product.price).toFixed(2)}
          </span>
          
          {/* Mobile: Show in cart indicator only */}
          {isInCart && (
            <span className="md:hidden text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              In cart ({cartQuantity})
            </span>
          )}
        </div>
      </div>

      {/* Flat Action Section - Below info, no card borders */}
      <div className="pt-1 pb-2" onClick={(e) => e.stopPropagation()}>
        {cartQuantity > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex-1 h-9 rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleDecreaseQuantity();
              }}
              disabled={updateCartItem.isPending || removeFromCart.isPending}
              data-testid={`button-decrease-quantity-${product.id}`}
              aria-label={`Decrease quantity of ${product.name}`}
            >
              <Minus size={16} />
            </button>
            <span className="min-w-[32px] text-center font-semibold text-sm" data-testid={`cart-quantity-${product.id}`}>
              {cartQuantity}
            </span>
            <button
              type="button"
              className="flex-1 h-9 rounded-md bg-primary text-white hover:bg-primary/90 active:bg-primary/80 flex items-center justify-center transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleIncreaseQuantity();
              }}
              disabled={updateCartItem.isPending || cartQuantity >= 10}
              data-testid={`button-increase-quantity-${product.id}`}
              aria-label={`Increase quantity of ${product.name}`}
            >
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="w-full h-9 rounded-md bg-secondary hover:bg-secondary/90 active:bg-secondary/80 text-primary font-semibold text-sm transition-colors flex items-center justify-center gap-1"
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
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        )}
      </div>
    </div>
  );
}
