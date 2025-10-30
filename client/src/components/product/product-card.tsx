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
      className="card cursor-pointer"
      data-testid={`product-card-${product.id}`}
      onClick={handleCardNavigation}
    >
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
        className="card-image"
        data-testid={`product-image-${product.id}`}
      />
      <div className="card-content">
        <h3 className="card-title" data-testid={`product-name-${product.id}`}>
          {product.name}
        </h3>
        <p className="card-text">{displaySummary}</p>
        {tagLabels.length > 0 && (
          <div className="tags">
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
        <div className="card-actions">
          <div className="card-price">
            <span data-testid={`product-price-${product.id}`}>₹{parseFloat(product.price).toFixed(2)}</span>
          </div>
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
  );
}
