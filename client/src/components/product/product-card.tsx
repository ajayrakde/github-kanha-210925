import { Product } from "@/lib/types";
import { Plus, Minus } from "lucide-react";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
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
    sessionStorage.setItem("productsScrollPosition", window.scrollY.toString());
    navigate(`/product/${product.id}`);
  };

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
    <div
      className="card cursor-pointer group"
      data-testid={`product-card-${product.id}`}
      onClick={handleCardNavigation}
    >
      {/* Image Container - 70% height on mobile */}
      <div className="relative md:static">
        {badgeLabel && (
          <span className="badge-strip" data-testid={`product-badge-${product.id}`}>
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
          className="card-image md:h-auto h-[280px] object-cover"
          data-testid={`product-image-${product.id}`}
        />
        
        {/* Quick-add button overlay - Mobile only */}
        {cartQuantity === 0 && (
          <button
            type="button"
            className="md:hidden absolute bottom-3 right-3 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all duration-200 active:scale-95 z-10"
            onClick={(e) => {
              e.stopPropagation();
              addToCart.mutate({
                productId: product.id,
                quantity: 1,
                product,
              });
            }}
            disabled={addToCart.isPending}
            data-testid={`button-quick-add-${product.id}`}
            aria-label={`Quick add ${product.name} to cart`}
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        )}

        {/* Quantity controls overlay - Mobile only, when in cart */}
        {cartQuantity > 0 && (
          <div 
            className="md:hidden absolute bottom-3 right-3 bg-white rounded-full shadow-lg px-4 py-2 flex items-center gap-3 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                handleDecreaseQuantity();
              }}
              disabled={updateCartItem.isPending || removeFromCart.isPending}
              data-testid={`button-decrease-quantity-mobile-${product.id}`}
              aria-label={`Decrease quantity of ${product.name}`}
            >
              <Minus size={16} />
            </button>
            <span className="font-semibold text-base min-w-[20px] text-center" data-testid={`cart-quantity-mobile-${product.id}`}>
              {cartQuantity}
            </span>
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-primary text-white hover:bg-primary/90 flex items-center justify-center transition-colors active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                handleIncreaseQuantity();
              }}
              disabled={updateCartItem.isPending || cartQuantity >= 10}
              data-testid={`button-increase-quantity-mobile-${product.id}`}
              aria-label={`Increase quantity of ${product.name}`}
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="card-content">
        <h3 className="card-title text-sm md:text-base font-semibold leading-tight" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        
        {/* Hide description on mobile, show on desktop */}
        <p className="card-text hidden md:block">{displaySummary}</p>
        
        {/* Hide tags on mobile, show on desktop */}
        {tagLabels.length > 0 && (
          <div className="tags hidden md:flex">
            {tagLabels.map((label, index) => {
              const paletteClass = label === "In your cart" ? "tag--green" : tagPalette[index % tagPalette.length];
              return (
                <span key={`${product.id}-${label}`} className={`tag ${paletteClass}`}>
                  {label}
                </span>
              );
            })}
          </div>
        )}
        
        {/* Mobile: Minimal price-only footer */}
        <div className="card-actions md:flex-row flex-col items-start md:items-center gap-2 md:gap-0">
          <div className="card-price">
            <span className="text-lg md:text-base font-bold" data-testid={`product-price-${product.id}`}>
              ₹{parseFloat(product.price).toFixed(2)}
            </span>
          </div>
          
          {/* Desktop: Show traditional cart controls */}
          <div className="hidden md:flex">
            {cartQuantity > 0 ? (
              <div className="quantity-group" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="quantity-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDecreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || removeFromCart.isPending}
                  data-testid={`button-decrease-quantity-${product.id}`}
                  aria-label={`Decrease quantity of ${product.name}`}
                >
                  <Minus size={14} />
                </button>
                <span data-testid={`cart-quantity-${product.id}`}>{cartQuantity}</span>
                <button
                  type="button"
                  className="quantity-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIncreaseQuantity();
                  }}
                  disabled={updateCartItem.isPending || cartQuantity >= 10}
                  data-testid={`button-increase-quantity-${product.id}`}
                  aria-label={`Increase quantity of ${product.name}`}
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary card-add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  addToCart.mutate({
                    productId: product.id,
                    quantity: 1,
                    product,
                  });
                }}
                disabled={addToCart.isPending}
                data-testid={`button-add-to-cart-${product.id}`}
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
