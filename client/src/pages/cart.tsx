import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartItem from "@/components/cart/cart-item";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import type { Offer } from "@/lib/types";

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
  const { cartItems, isLoading, subtotal } = useCart();
  const queryClient = useQueryClient();

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
      } else {
        setCouponError(result.message);
        toast({
          title: "Invalid Coupon",
          description: result.message,
          variant: "destructive",
        });
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
      const discount = (subtotal * parseFloat(appliedOffer.discountValue)) / 100;
      return appliedOffer.maxDiscount 
        ? Math.min(discount, parseFloat(appliedOffer.maxDiscount))
        : discount;
    } else {
      return parseFloat(appliedOffer.discountValue);
    }
  };

  const discount = calculateDiscount();
  const total = subtotal - discount + shippingCharge;

  if (isLoading) {
    return (
      <div className="space-y-3 sm:space-y-6">
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
    );
  }

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">🛒</div>
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
        <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Add some products to get started</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping">
          Continue Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Back Button and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
        <Button 
          onClick={() => setLocation("/")}
          variant="ghost" 
          className="-ml-2 hover:bg-gray-100"
          data-testid="button-back-to-products"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Shopping Cart</h2>
          <p className="text-sm sm:text-base text-gray-600">Review your items before checkout</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          {/* Cart Items */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <div className="space-y-4">
              {cartItems.map((item, index) => (
                <div key={item.id}>
                  <CartItem item={item} />
                  {index < cartItems.length - 1 && <hr className="border-gray-100" />}
                </div>
              ))}
            </div>
          </div>

          {/* Coupon Section */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
            <h3 className="text-sm sm:text-base font-medium text-gray-900 mb-3 sm:mb-4">Apply Coupon</h3>
            {!appliedOffer ? (
              <>
                <div className="flex space-x-3">
                  <Input
                    type="text"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={handleCouponChange}
                    className={`flex-1 ${couponError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    data-testid="input-coupon-code"
                  />
                  <Button
                    onClick={applyCoupon}
                    disabled={!couponCode.trim() || validateOfferMutation.isPending || isAuthLoading}
                    data-testid="button-apply-coupon"
                  >
                    {validateOfferMutation.isPending ? "Applying..." : "Apply"}
                  </Button>
                </div>
                {couponError && (
                  <div className="mt-2 text-sm text-red-600" data-testid="coupon-error">
                    {couponError}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-green-600">
                    <i className="fas fa-check-circle mr-1"></i>
                    Coupon "{appliedOffer.code}" applied! You saved ₹{discount.toFixed(2)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={removeCoupon}
                    data-testid="button-remove-coupon"
                  >
                    Remove
                  </Button>
                </div>
                {/* Show input to apply a different coupon */}
                <div className="pt-2 border-t">
                  <p className="text-sm text-gray-600 mb-2">Want to try a different coupon?</p>
                  <div className="flex space-x-3">
                    <Input
                      type="text"
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={handleCouponChange}
                      className={`flex-1 ${couponError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      data-testid="input-coupon-code-replace"
                    />
                    <Button
                      onClick={applyCoupon}
                      disabled={!couponCode.trim() || validateOfferMutation.isPending || isAuthLoading}
                      data-testid="button-replace-coupon"
                    >
                      {validateOfferMutation.isPending ? "Applying..." : "Replace"}
                    </Button>
                  </div>
                  {couponError && (
                    <div className="mt-2 text-sm text-red-600" data-testid="coupon-error-replace">
                      {couponError}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 sticky top-24">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Order Summary</h3>
            <div className="space-y-3 text-sm">
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
    </div>
  );
}
