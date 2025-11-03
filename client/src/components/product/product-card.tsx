import { Product } from "@/lib/types";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { haptic } from "@/lib/haptic-utils";
import ProductAction from "./product-action";

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
          
          {/* Product Action Button */}
          <div onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0">
            <ProductAction
              quantity={cartQuantity}
              onAdd={() => {
                haptic.add();
                addToCart.mutate({
                  productId: product.id,
                  quantity: 1,
                  product,
                });
              }}
              onIncrease={handleIncreaseQuantity}
              onDecrease={handleDecreaseQuantity}
              isAddPending={addToCart.isPending}
              isUpdatePending={updateCartItem.isPending || removeFromCart.isPending}
              maxQuantity={10}
              productName={product.name}
              productId={product.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
