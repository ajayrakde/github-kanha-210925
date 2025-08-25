import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product, CartItemWithProduct } from "@/lib/types";
import { X, ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react";

interface ProductDetailsModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ImageLightboxProps {
  images: string[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

function ImageLightbox({ images, currentIndex, isOpen, onClose, onPrevious, onNext }: ImageLightboxProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    if (isOpen) {
      // Use capture phase and higher priority
      document.addEventListener('keydown', handleEscape, { capture: true });
      return () => document.removeEventListener('keydown', handleEscape, { capture: true });
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lightboxContent = (
    <div 
      className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex items-center justify-center"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }}
    >
      <div 
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onClose();
          }}
          className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
          data-testid="button-close-lightbox"
        >
          <X size={32} />
        </button>
        
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrevious();
              }}
              className="absolute left-4 text-white hover:text-gray-300 z-10"
              data-testid="button-previous-lightbox"
            >
              <ChevronLeft size={48} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-4 text-white hover:text-gray-300 z-10"
              data-testid="button-next-lightbox"
            >
              <ChevronRight size={48} />
            </button>
          </>
        )}
        
        <img
          src={images[currentIndex]}
          alt={`Product image ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
          data-testid="lightbox-image"
        />
        
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full ${
                  index === currentIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(lightboxContent, document.body);
}

export default function ProductDetailsModal({ product, isOpen, onClose }: ProductDetailsModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Handle body scroll locking
  useEffect(() => {
    if (isOpen || lightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, lightboxOpen]);

  // Handle escape key for CardDetails (only when lightbox is not open)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !lightboxOpen) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    if (isOpen && !lightboxOpen) {
      document.addEventListener('keydown', handleEscape, true);
      return () => document.removeEventListener('keydown', handleEscape, true);
    }
  }, [isOpen, lightboxOpen, onClose]);

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

  if (!product) return null;

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
    if (cartItem && cartItem.quantity < 10) {
      updateCartMutation.mutate({
        productId: product.id,
        quantity: cartItem.quantity + 1
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
      <Dialog open={isOpen} onOpenChange={(open) => {
        // Only allow dialog to close if lightbox is not open
        if (!open && !lightboxOpen) {
          onClose();
        }
      }}>
        <DialogContent 
          className="max-w-4xl max-h-[90vh] overflow-y-auto" 
          data-testid="product-details-modal"
          style={{
            pointerEvents: lightboxOpen ? 'none' : 'auto',
            opacity: lightboxOpen ? 0.3 : 1,
            transition: 'opacity 0.2s ease-in-out'
          }}
          onEscapeKeyDown={(e) => {
            if (lightboxOpen) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onPointerDownOutside={(e) => {
            if (lightboxOpen) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onInteractOutside={(e) => {
            if (lightboxOpen) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold" data-testid="product-details-title">
              {product.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Product details for {product.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Image Section */}
            <div className="space-y-4">
              <div className="relative group">
                <img
                  src={productImages[currentImageIndex]}
                  alt={product.name}
                  className="w-full h-96 object-contain rounded-lg cursor-pointer bg-gray-50"
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
                  </>
                )}
              </div>
              
              {productImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {productImages.map((image, index) => (
                    <img
                      key={index}
                      src={image}
                      alt={`${product.name} ${index + 1}`}
                      className={`w-16 h-16 object-cover rounded cursor-pointer border-2 ${
                        index === currentImageIndex ? 'border-blue-500' : 'border-gray-200'
                      }`}
                      onClick={() => setCurrentImageIndex(index)}
                      data-testid={`product-thumbnail-${index}`}
                    />
                  ))}
                </div>
              )}
            </div>
            
            {/* Details Section */}
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900" data-testid="product-name">
                  {product.name}
                </h2>
                {product.brand && (
                  <p className="text-sm text-gray-600 mt-1" data-testid="product-brand">
                    by {product.brand}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-gray-900" data-testid="product-price">
                  ₹{parseFloat(product.price).toFixed(2)}
                </span>
                {product.isActive ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">In Stock</Badge>
                ) : (
                  <Badge variant="destructive">Out of Stock</Badge>
                )}
              </div>
              
              {/* Cart Controls */}
              <div className="pt-4">
                {cartQuantity > 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 border rounded-lg">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDecreaseQuantity();
                        }}
                        disabled={updateCartMutation.isPending || removeFromCartMutation.isPending}
                        data-testid="button-decrease-quantity"
                      >
                        <Minus size={16} />
                      </Button>
                      <span className="px-3 py-2 font-medium" data-testid="cart-quantity">
                        {cartQuantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleIncreaseQuantity();
                        }}
                        disabled={updateCartMutation.isPending || cartQuantity >= 10}
                        data-testid="button-increase-quantity"
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <span className="text-sm text-gray-600">in cart</span>
                  </div>
                ) : (
                  <Button
                    onClick={() => addToCartMutation.mutate()}
                    disabled={addToCartMutation.isPending || !product.isActive}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    data-testid="button-add-to-cart"
                  >
                    {addToCartMutation.isPending ? "Adding..." : "Add to Cart"}
                  </Button>
                )}
              </div>
              
              {product.description && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-600" data-testid="product-description">
                    {product.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={productImages}
        currentIndex={currentImageIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onPrevious={handlePreviousImage}
        onNext={handleNextImage}
      />
    </>
  );
}