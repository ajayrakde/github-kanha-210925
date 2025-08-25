import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import { ChevronLeft, ChevronRight, Plus, Minus, ArrowLeft } from "lucide-react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import ImageLightbox from "../components/product/image-lightbox";

export default function ProductDetails() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get product data
  const { data: product, isLoading: productLoading } = useQuery<Product>({
    queryKey: [`/api/products/${id}`],
  });

  // Get cart data
  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
  });

  // Handle back navigation with scroll position
  const handleBack = () => {
    const scrollPos = sessionStorage.getItem('productsScrollPosition');
    navigate('/');
    if (scrollPos) {
      setTimeout(() => {
        window.scrollTo(0, parseInt(scrollPos));
      }, 0);
    }
  };

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const addToCartMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/cart/add`, { productId: product?.id, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: `${product?.name} has been added to your cart`,
      });
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

  if (productLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading product...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-gray-500 mb-4">Product not found</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
        </div>
      </div>
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

  const handleImageClick = () => {
    setLightboxOpen(true);
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
    <>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Back Button */}
        <Button 
          onClick={handleBack}
          variant="ghost" 
          className="mb-4 -ml-2 hover:bg-gray-100"
          data-testid="button-back-to-products"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image Section */}
          <div className="space-y-4">
            <div className="relative group">
              <img
                src={productImages[currentImageIndex]}
                alt={product.name}
                className="w-full h-[500px] object-contain rounded-lg cursor-pointer bg-gray-50"
                onClick={handleImageClick}
                data-testid="product-main-image"
              />
              
              {productImages.length > 1 && (
                <>
                  <button
                    onClick={handlePreviousImage}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid="button-previous-image"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid="button-next-image"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>
            
            {/* Thumbnail Images */}
            {productImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {productImages.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentImageIndex 
                        ? 'border-blue-600' 
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                    data-testid={`thumbnail-${index}`}
                  >
                    <img
                      src={image}
                      alt={`Product thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Product Info Section */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="product-details-title">
                {product.name}
              </h1>
              {product.isActive ? (
                <Badge className="bg-green-500 text-white" data-testid="badge-in-stock">
                  Available
                </Badge>
              ) : (
                <Badge variant="secondary" data-testid="badge-out-of-stock">
                  Unavailable
                </Badge>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="text-3xl font-bold text-gray-900" data-testid="product-price">
                ₹{parseFloat(product.price).toFixed(2)}
              </div>
              {/* Original price display removed as not in schema */}
            </div>
            
            {/* Cart Controls */}
            <div className="space-y-3">
              {isInCart ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleDecreaseQuantity}
                      disabled={removeFromCartMutation.isPending || updateCartMutation.isPending}
                      className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                      data-testid="button-decrease-quantity"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="text-lg font-medium w-12 text-center" data-testid="cart-quantity">
                      {cartQuantity}
                    </span>
                    <button
                      onClick={handleIncreaseQuantity}
                      disabled={cartQuantity >= 10 || updateCartMutation.isPending}
                      className="w-10 h-10 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-increase-quantity"
                    >
                      <Plus size={18} />
                    </button>
                    <span className="text-sm text-gray-600">in cart</span>
                  </div>
                  
                  {/* Proceed to Checkout Button - shown when cart has items */}
                  {cartItems && cartItems.length > 0 && (
                    <Button
                      onClick={() => navigate('/checkout')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                      data-testid="button-proceed-checkout"
                    >
                      Proceed to Checkout
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => addToCartMutation.mutate()}
                  disabled={addToCartMutation.isPending || !product.isActive}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  data-testid="button-add-to-cart"
                >
                  {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
                </Button>
              )}
            </div>
            
            {product.description && (
              <div className="border-t pt-6">
                <h3 className="font-semibold text-lg text-gray-900 mb-3">Description</h3>
                <div data-testid="product-description" className="prose prose-sm max-w-none">
                  <MarkdownRenderer content={product.description} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ImageLightbox
        images={productImages}
        currentIndex={currentImageIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onPrevious={handlePreviousImage}
        onNext={handleNextImage}
        onGoToIndex={(index: number) => setCurrentImageIndex(index)}
      />
    </>
  );
}