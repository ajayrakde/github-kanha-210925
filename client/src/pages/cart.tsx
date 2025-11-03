import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartItem from "@/components/cart/cart-item";
import ProductCard from "@/components/product/product-card";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, Tag } from "lucide-react";
import type { Offer, Product } from "@/lib/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { scrollToContext } from "@/lib/scroll-utils";

export default function Cart() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [buyerId, setBuyerId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("buyerId");
    }
    return null;
  });
  const [couponCode, setCouponCode] = useState("");
  const [appliedOffer, setAppliedOffer] = useState<Offer | null>(null);
  const [couponError, setCouponError] = useState("");
  const [shippingCharge, setShippingCharge] = useState(50); // Default shipping
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isCouponOpen, setIsCouponOpen] = useState(() => {
    // Always open on desktop, closed on mobile
    return typeof window !== 'undefined' && window.innerWidth >= 768;
  });
  const { cartItems, isLoading, subtotal } = useCart();
  const queryClient = useQueryClient();

  // Fetch products for empty cart suggestions
  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: !isLoading && (!cartItems || cartItems.length === 0), // Only fetch when cart is empty
  });

  useEffect(() => {
    queryClient.setQueryData(
      ["checkout", "selectedOffer"],
      appliedOffer
        ? { id: appliedOffer.id, code: appliedOffer.code }
        : null
    );
  }, [appliedOffer, queryClient]);

  const { data: authData, isLoading: isAuthLoading } = useQuery<{
    authenticated: boolean;
    user?: { id: string };
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  useEffect(() => {
    if (authData?.authenticated && authData.user?.id) {
      setBuyerId(authData.user.id);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("buyerId", authData.user.id);
      }
    } else if (authData === null || (authData && !authData.authenticated)) {
      setBuyerId(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("buyerId");
      }
    }
  }, [authData]);

  // Calculate shipping charge when cart changes
  useEffect(() => {
    const calculateShipping = async () => {
      if (cartItems.length === 0 || subtotal === 0) {
        setShippingCharge(50); // Default for empty cart
        return;
      }

      setIsCalculatingShipping(true);
      try {
        const response = await apiRequest("POST", "/api/shipping/calculate", {
          cartItems,
          pincode: "110001", // Default pincode - will be updated during checkout
          orderValue: subtotal
        });
        const result = await response.json();
        setShippingCharge(result.shippingCharge);
      } catch (error) {
        console.error("Error calculating shipping:", error);
        setShippingCharge(50); // Fall back to default
      } finally {
        setIsCalculatingShipping(false);
      }
    };

    calculateShipping();
  }, [cartItems, subtotal]);

  const validateOfferMutation = useMutation({
    mutationFn: async ({ code, userId }: { code: string; userId: string | null }) => {
      const response = await apiRequest("POST", "/api/offers/validate", {
        code,
        userId,
        cartValue: subtotal,
      });
      return await response.json();
    },
    onSuccess: (result) => {
      if (result.valid) {
        // Clear any previous coupon (single coupon logic)
        setAppliedOffer(result.offer);
        setCouponError("");
        setCouponCode("");
        toast({
          title: "Coupon Applied!",
          description: `You saved with ${result.offer.code}`,
        });
        // Scroll to show the updated total with discount
        setTimeout(() => scrollToContext("coupon-applied"), 300);
      } else {
        setCouponError(result.message);
        toast({
          title: "Invalid Coupon",
          description: result.message,
          variant: "destructive",
        });
        // Scroll to coupon input on error
        setTimeout(() => scrollToContext("coupon-invalid"), 300);
      }
    },
    onError: (error) => {
      setCouponError("Failed to validate coupon");
      toast({
        title: "Error",
        description: "Failed to validate coupon",
        variant: "destructive",
      });
    },
  });

  const applyCoupon = () => {
    if (couponCode.trim()) {
      setCouponError("");
      validateOfferMutation.mutate({
        code: couponCode.toUpperCase(),
        userId: buyerId,
      });
    }
  };

  const removeCoupon = () => {
    setAppliedOffer(null);
    setCouponError("");
    setCouponCode("");
    toast({
      title: "Coupon Removed",
      description: "Coupon has been removed from your order",
    });
  };

  const handleCouponChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCouponCode(e.target.value);
    // Reset error styling when user starts typing
    if (couponError) {
      setCouponError("");
    }
  };

  // Price includes 5% tax already
  const taxRate = 0.05;
  const basePrice = subtotal / (1 + taxRate);
  const taxAmount = subtotal - basePrice;

  const calculateDiscount = () => {
    if (!appliedOffer) return 0;
    
    // Discount applied on all-inclusive price (price + tax)
    if (appliedOffer.discountType === 'percentage') {
      const discount = (subtotal * (parseFloat(appliedOffer.discountValue) || 0)) / 100;
      return appliedOffer.maxDiscount 
        ? Math.min(discount, (parseFloat(appliedOffer.maxDiscount) || 0))
        : discount;
    } else {
      return parseFloat(appliedOffer.discountValue) || 0;
    }
  };

  const discount = calculateDiscount();
  const total = subtotal - discount + shippingCharge;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="space-y-3 sm:space-y-3 sm:space-y-6">
          <div className="mb-3 sm:mb-6">
            <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-64"></div>
          </div>
        <div className="grid lg:grid-cols-3 gap-3 sm:gap-6">
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gray-200 rounded-md"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-10 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
              <div className="space-y-3">
                {Array(4).fill(0).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    const suggestedProducts = products?.filter(p => p.isActive).slice(0, 4) || [];
    
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Empty Cart Message */}
        <div className="text-center mb-8">
          <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">🛒</div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Add some products to get started</p>
          <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping">
            Continue Shopping
          </Button>
        </div>

        {/* Product Suggestions - Mobile Only */}
        {suggestedProducts.length > 0 && (
          <div className="mt-8 md:hidden">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 px-2">You might like these</h3>
            <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar px-2">
              {suggestedProducts.map((product) => (
                <div 
                  key={product.id} 
                  className="flex-shrink-0 w-[280px] snap-start"
                  data-testid={`empty-cart-suggestion-${product.id}`}
                >
                  <ProductCard 
                    product={product}
                    onClick={(id) => setLocation(`/product/${id}`)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4">
      <div className="space-y-3 sm:space-y-6">
      {/* Back Button and Title */}
      <div className="flex sm:flex-row items-center sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          data-testid="button-back-to-products"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Shopping Cart</h2>
          <p className="text-sm sm:text-base text-gray-600 hidden sm:block">Review your items before checkout</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          {/* Cart Items */}
          <div className="bg-white rounded-lg shadow-sm py-2">
            <div className="space-y-0">
              {cartItems.map((item, index) => (
                <div key={item.id} className="px-4 sm:px-6">
                  <CartItem item={item} />
                  {index < cartItems.length - 1 && <hr className="border-gray-100" />}
                </div>
              ))}
            </div>
          </div>

          {/* Coupon Section - Collapsible on Mobile, Always Open on Desktop */}
          <div className="bg-white rounded border border-gray-200">
            {/* Desktop: Always Open */}
            <div className="hidden md:block p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Apply Coupon</h3>
              {!appliedOffer ? (
                <>
                  <div className="flex space-x-2">
                    <Input
                      id="coupon-input-desktop"
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={handleCouponChange}
                      className={`flex-1 text-sm ${couponError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      data-testid="input-coupon-code"
                    />
                    <Button
                      onClick={applyCoupon}
                      disabled={!couponCode.trim() || validateOfferMutation.isPending || isAuthLoading}
                      size="sm"
                      data-testid="button-apply-coupon"
                    >
                      {validateOfferMutation.isPending ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                  {couponError && (
                    <div className="mt-2 text-xs text-red-600" data-testid="coupon-error">
                      {couponError}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between bg-green-50 p-2 rounded">
                  <div className="text-xs text-green-600">
                    <i className="fas fa-check-circle mr-1"></i>
                    "{appliedOffer.code}" applied
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeCoupon}
                    className="text-gray-500 hover:text-red-600 h-6 px-2 text-xs"
                    data-testid="button-remove-coupon"
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* Mobile: Collapsible */}
            <Collapsible
              open={isCouponOpen}
              onOpenChange={setIsCouponOpen}
              className="md:hidden"
            >
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 min-w-0" data-testid="button-toggle-coupon">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Tag className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {appliedOffer ? `Coupon Applied: ${appliedOffer.code}` : 'Apply Coupon'}
                  </h3>
                  {appliedOffer && (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">
                      -₹{discount.toFixed(2)}
                    </span>
                  )}
                </div>
                <ChevronDown 
                  className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ${isCouponOpen ? 'rotate-180' : ''}`}
                />
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="p-4 border-t">
                  {!appliedOffer ? (
                    <>
                      <div className="flex space-x-2">
                        <Input
                          id="coupon-input-mobile"
                          type="text"
                          placeholder="Enter coupon code"
                          value={couponCode}
                          onChange={handleCouponChange}
                          className={`flex-1 text-sm ${couponError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          data-testid="input-coupon-code-mobile"
                        />
                        <Button
                          onClick={applyCoupon}
                          disabled={!couponCode.trim() || validateOfferMutation.isPending || isAuthLoading}
                          size="sm"
                          data-testid="button-apply-coupon-mobile"
                        >
                          {validateOfferMutation.isPending ? "Applying..." : "Apply"}
                        </Button>
                      </div>
                      {couponError && (
                        <div className="mt-2 text-xs text-red-600" data-testid="coupon-error-mobile">
                          {couponError}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between bg-green-50 p-2 rounded">
                      <div className="text-xs text-green-600">
                        <i className="fas fa-check-circle mr-1"></i>
                        "{appliedOffer.code}" applied
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={removeCoupon}
                        className="text-gray-500 hover:text-red-600 h-6 px-2 text-xs"
                        data-testid="button-remove-coupon-mobile"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Order Summary - Hidden on mobile (shown in sticky bar instead) */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 sticky top-24" id="order-total-desktop">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Order Summary</h3>
            <div className="space-y-3 text-sm" id="cart-summary-desktop">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal ({cartItems.length} items)</span>
                <span data-testid="text-subtotal">₹{basePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax (5%)</span>
                <span data-testid="text-tax">₹{taxAmount.toFixed(2)}</span>
              </div>
              {appliedOffer && (
                <div className="flex justify-between text-green-600">
                  <span>Coupon Discount</span>
                  <span data-testid="text-discount">-₹{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span data-testid="text-shipping">₹{shippingCharge.toFixed(2)}</span>
              </div>
              <hr className="my-3" />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span data-testid="text-total">₹{total.toFixed(2)}</span>
              </div>
            </div>
            <Button
              className="w-full mt-6 bg-green-600 hover:bg-green-700"
              onClick={() => setLocation("/checkout")}
              data-testid="button-proceed-checkout"
            >
              Proceed to Checkout
            </Button>
          </div>
        </div>
      </div>

      {/* Sticky Checkout Bar - Mobile Only */}
      <div className="lg:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-20" id="cart-summary-mobile">
        <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto" id="order-total-mobile">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600">Total ({cartItems.length} items)</div>
            <div className="text-xl font-bold text-gray-900">₹{total.toFixed(2)}</div>
            {appliedOffer && (
              <div className="text-xs text-green-600">Saved ₹{discount.toFixed(2)}</div>
            )}
          </div>
          <Button
            className="bg-green-600 hover:bg-green-700 active:bg-green-800 h-12 px-6 text-base font-semibold flex-shrink-0"
            onClick={() => setLocation("/checkout")}
            data-testid="button-proceed-checkout-mobile"
          >
            Checkout
          </Button>
        </div>
      </div>
    </div>
    </div>
  );
}
