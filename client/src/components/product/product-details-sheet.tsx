import { useState, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import { ChevronLeft, ChevronRight, Plus, Minus, X } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import BottomSheet from "@/components/ui/bottom-sheet";
import { scrollToContext } from "@/lib/scroll-utils";

interface ProductDetailsSheetProps {
  productId: string;
  open: boolean;
  onClose: () => void;
}

export function ProductDetailsSheet({ productId, open, onClose }: ProductDetailsSheetProps) {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageSwipeStart, setImageSwipeStart] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get product data
  const { data: product, isLoading: productLoading } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    enabled: open && !!productId,
  });

  // Get cart data
  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  const addToCartMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/cart/add`, { productId: product?.id, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: `${product?.name} has been added to your cart`,
      });
      // Scroll to cart bar on mobile after adding
      setTimeout(() => scrollToContext('item-added-to-cart-mobile'), 300);
    },
    onError: (error: any) => {
      console.error('Add to cart error:', error);
      toast({
        title: "Error",
        description: "Failed to add product to cart",
        variant: "destructive",
      });
    },
  });

  const updateCartMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      apiRequest("PATCH", `/api/cart/${productId}`, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      console.error('Update cart error:', error);
      toast({
        title: "Error",
        description: "Failed to update cart",
        variant: "destructive",
      });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (productId: string) => apiRequest("DELETE", `/api/cart/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      console.error('Remove from cart error:', error);
      toast({
        title: "Error",
        description: "Failed to remove from cart",
        variant: "destructive",
      });
    },
  });

  if (!product && !productLoading) {
    return (
      <BottomSheet open={open} onOpenChange={handleOpenChange}>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-gray-500 mb-4">Product not found</div>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </BottomSheet>
    );
  }

  if (productLoading || !product) {
    return (
      <BottomSheet open={open} onOpenChange={handleOpenChange}>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading product...</div>
        </div>
      </BottomSheet>
    );
  }

  const productImages = product.images && product.images.length > 0
    ? product.images
    : [product.displayImageUrl || product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300`];

  const cartItem = cartItems?.find(item => item.productId === product.id);
  const isInCart = !!cartItem;
  const cartQuantity = cartItem?.quantity || 0;

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : productImages.length - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev < productImages.length - 1 ? prev + 1 : 0));
  };

  // Swipe gestures for image gallery
  const handleImageTouchStart = (e: TouchEvent) => {
    setImageSwipeStart(e.touches[0].clientX);
  };

  const handleImageTouchEnd = (e: TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    const diff = imageSwipeStart - touchEnd;

    // Swipe threshold: 50px
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swiped left - next image
        handleNextImage();
      } else {
        // Swiped right - previous image
        handlePreviousImage();
      }
    }
    setImageSwipeStart(0);
  };

  const handleIncreaseQuantity = () => {
    const newQuantity = Math.min((cartItem?.quantity || 0) + 1, 10);
    if (!cartItem) {
      addToCartMutation.mutate();
    } else if (newQuantity <= 10) {
      updateCartMutation.mutate({
        productId: product.id,
        quantity: newQuantity
      });
    }
  };

  const handleDecreaseQuantity = () => {
    if (cartItem) {
      if (cartItem.quantity === 1) {
        removeFromCartMutation.mutate(product.id);
      } else {
        updateCartMutation.mutate({
          productId: product.id,
          quantity: cartItem.quantity - 1
        });
      }
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={handleOpenChange}>
      <div className="flex flex-col h-full">
        {/* Product Images - Swipeable Gallery */}
        <div 
          className="relative bg-gray-50"
          onTouchStart={handleImageTouchStart}
          onTouchEnd={handleImageTouchEnd}
        >
          <img
            src={productImages[currentImageIndex] as string}
            alt={product.name}
            className="w-full h-[400px] object-contain"
            data-testid={`product-detail-image-${currentImageIndex}`}
          />
          
          {/* Image navigation */}
          {productImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePreviousImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"
                data-testid="button-previous-image"
                aria-label="Previous image"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={handleNextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"
                data-testid="button-next-image"
                aria-label="Next image"
              >
                <ChevronRight size={20} />
              </button>
              
              {/* Image indicators */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                {productImages.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 rounded-full transition-all ${
                      index === currentImageIndex 
                        ? 'w-8 bg-white' 
                        : 'w-2 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Product Details - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900" data-testid="product-name">
                  {product.name}
                </h1>
                {product.classification && (
                  <Badge variant="secondary" className="shrink-0">
                    {product.classification}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-bold text-primary" data-testid="product-price">
                  ₹{parseFloat(product.price).toFixed(2)}
                </span>
              </div>

              {product.brand && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Brand:</span> {product.brand}
                </div>
              )}
            </div>

            {/* Stock Status */}
            <div>
              {product.stock > 0 ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  In Stock ({product.stock} available)
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  Out of Stock
                </Badge>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div className="border-t pt-4">
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <div className="prose prose-sm max-w-none">
                  <MarkdownRenderer content={product.description} />
                </div>
              </div>
            )}

            {/* Additional spacing at bottom for sticky button */}
            <div className="h-20" />
          </div>
        </div>

        {/* Sticky Add to Cart Button */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
          {!isInCart ? (
            <Button
              className="w-full h-14 text-lg font-semibold"
              onClick={handleIncreaseQuantity}
              disabled={product.stock === 0 || addToCartMutation.isPending}
              data-testid="button-add-to-cart"
            >
              {addToCartMutation.isPending ? (
                "Adding..."
              ) : product.stock === 0 ? (
                "Out of Stock"
              ) : (
                <>
                  <Plus className="mr-2" size={20} />
                  Add to Cart · ₹{parseFloat(product.price).toFixed(2)}
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 flex-1 bg-gray-100 rounded-lg p-2">
                <button
                  type="button"
                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-50 flex items-center justify-center transition-colors active:scale-95 shadow-sm"
                  onClick={handleDecreaseQuantity}
                  disabled={updateCartMutation.isPending || removeFromCartMutation.isPending}
                  data-testid="button-decrease-quantity"
                  aria-label="Decrease quantity"
                >
                  <Minus size={20} />
                </button>
                
                <span className="flex-1 text-center text-lg font-semibold" data-testid="cart-quantity">
                  {cartQuantity}
                </span>
                
                <button
                  type="button"
                  className="w-10 h-10 rounded-lg bg-white hover:bg-gray-50 flex items-center justify-center transition-colors active:scale-95 shadow-sm"
                  onClick={handleIncreaseQuantity}
                  disabled={cartQuantity >= 10 || cartQuantity >= product.stock || updateCartMutation.isPending}
                  data-testid="button-increase-quantity"
                  aria-label="Increase quantity"
                >
                  <Plus size={20} />
                </button>
              </div>
              
              <div className="text-right">
                <div className="text-xs text-gray-600">Subtotal</div>
                <div className="text-lg font-bold text-primary">
                  ₹{(parseFloat(product.price) * cartQuantity).toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

export default ProductDetailsSheet;
