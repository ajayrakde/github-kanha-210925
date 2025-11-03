import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
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
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading product...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4">
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
  const structuredDataImages = productImages.filter((image): image is string => Boolean(image));
  const trimmedDescription = product.description?.trim();
  const parsedPrice = Number.parseFloat(product.price);
  const hasValidPrice = Number.isFinite(parsedPrice);
  const productStructuredData = product.name && trimmedDescription && structuredDataImages.length > 0 && hasValidPrice
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: trimmedDescription,
        image: structuredDataImages,
        sku: product.id,
        productID: product.id,
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          price: parsedPrice.toFixed(2),
          availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        },
      }
    : null;

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
      {productStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData) }}
        />
      )}
      <div className="max-w-7xl mx-auto px-4">
        {/* Main Product Container - Mobile: Flex Column, Desktop: Grid */}
        <section className="w-full bg-white dark:bg-gray-900 rounded-lg shadow-md px-4 sm:px-6 py-3 sm:py-6 flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-2 sm:gap-8">
          
          {/* Back Button & Title - Mobile Only (Side by Side) */}
          <header className="sm:hidden flex items-start gap-2">
            <Button
              onClick={handleBack}
              variant="ghost"
              className="flex-shrink-0 -ml-2 h-9 w-9 p-0 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
              data-testid="button-back-to-products"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-tight mb-1" data-testid="product-details-title">
                {product.name}
              </h1>
              {product.isActive ? (
                <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0" data-testid="badge-in-stock">
                  Available
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid="badge-out-of-stock">
                  Unavailable
                </Badge>
              )}
            </div>
          </header>

          {/* Image Container with Aspect Ratio */}
          <div className="w-full">
            <div className="relative group w-full aspect-square sm:aspect-auto">
              <img
                src={productImages[currentImageIndex]}
                alt={product.name}
                className="w-full h-full sm:h-[500px] object-contain rounded-lg cursor-pointer bg-gray-50"
                onClick={handleImageClick}
                data-testid="product-main-image"
              />
              
              {productImages.length > 1 && (
                <>
                  <button
                    onClick={handlePreviousImage}
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid="button-previous-image"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid="button-next-image"
                  >
                    <ChevronRight size={20} />
                  </button>
                  
                  {/* Dots Indicator - Mobile Only */}
                  <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5 sm:hidden">
                    {productImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentImageIndex 
                            ? 'bg-white w-6' 
                            : 'bg-white bg-opacity-50 hover:bg-opacity-75'
                        }`}
                        data-testid={`dot-indicator-${index}`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            
            {/* Thumbnail Images - Desktop Only */}
            {productImages.length > 1 && (
              <div className="hidden sm:flex gap-2 overflow-x-auto mt-3">
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
          
          {/* Product Info & CTA Section */}
          <div className="w-full space-y-2 sm:space-y-5">
            {/* Back Button & Title - Desktop Only */}
            <header className="hidden sm:block">
              <div className="flex items-start gap-2 mb-3">
                <Button
                  onClick={handleBack}
                  variant="ghost"
                  className="flex-shrink-0 -ml-2 h-9 w-9 p-0 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
                  data-testid="button-back-to-products"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2" data-testid="product-details-title">
                    {product.name}
                  </h1>
                  {product.isActive ? (
                    <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0" data-testid="badge-in-stock">
                      Available
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid="badge-out-of-stock">
                      Unavailable
                    </Badge>
                  )}
                </div>
              </div>
            </header>

            {/* Price */}
            <div className="text-2xl sm:text-3xl font-bold text-gray-900" data-testid="product-price">
              ₹{parseFloat(product.price).toFixed(2)}
            </div>
            
            {/* Cart Controls */}
            <div className="space-y-1">
              {isInCart ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDecreaseQuantity}
                      disabled={removeFromCartMutation.isPending || updateCartMutation.isPending}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-colors disabled:opacity-50"
                      data-testid="button-decrease-quantity"
                    >
                      <i className="fas fa-minus text-[10px]"></i>
                    </button>
                    <span className="text-base font-medium w-8 text-center" data-testid="cart-quantity">
                      {cartQuantity}
                    </span>
                    <button
                      onClick={handleIncreaseQuantity}
                      disabled={cartQuantity >= 10 || updateCartMutation.isPending}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-increase-quantity"
                    >
                      <i className="fas fa-plus text-[10px]"></i>
                    </button>
                    <span className="text-sm text-gray-600">in cart</span>
                  </div>
                  
                  {/* Proceed to Checkout Button */}
                  {cartItems && cartItems.length > 0 && (
                    <>
                      <Button
                        onClick={() => navigate('/checkout')}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        size="lg"
                        data-testid="button-proceed-checkout"
                      >
                        Proceed to Checkout
                      </Button>
                      <Button
                        onClick={handleBack}
                        variant="outline"
                        className="w-full"
                        size="lg"
                        data-testid="button-continue-shopping"
                      >
                        Continue Shopping
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => addToCartMutation.mutate()}
                  disabled={addToCartMutation.isPending || !product.isActive}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                  data-testid="button-add-to-cart"
                >
                  {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
                </Button>
              )}
            </div>

            {/* Description - Desktop Only */}
            {product.description && (
              <div className="hidden sm:block border-t pt-4">
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Description</h3>
                <div data-testid="product-description" className="prose prose-sm max-w-none">
                  <MarkdownRenderer content={product.description} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Description - Mobile Only (Below Hero) */}
        {product.description && (
          <section className="sm:hidden bg-white dark:bg-gray-900 rounded-lg shadow-md px-4 py-4 mt-2">
            <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100 mb-2">Description</h3>
            <div data-testid="product-description" className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownRenderer content={product.description} />
            </div>
          </section>
        )}
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