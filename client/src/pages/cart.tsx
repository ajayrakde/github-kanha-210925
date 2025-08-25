import { useQuery, useMutation } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartItem from "@/components/cart/cart-item";
import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Cart() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [couponCode, setCouponCode] = useState("");
  const [appliedOffer, setAppliedOffer] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const { cartItems, isLoading, subtotal } = useCart();

  const validateOfferMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/offers/validate", {
        code,
        userId: "temp-user", // Will be replaced during checkout
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
      validateOfferMutation.mutate(couponCode.toUpperCase());
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
  const shippingCharge = 50; // Fixed shipping charge
  const total = subtotal - discount + shippingCharge;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-6">
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
            <div className="bg-white rounded-lg shadow-sm p-6">
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
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
        <p className="text-gray-600 mb-6">Add some products to get started</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping">
          Continue Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Shopping Cart</h2>
        <p className="text-gray-600">Review your items before checkout</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Cart Items */}
          <div className="bg-white rounded-lg shadow-sm p-6">
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
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="font-medium text-gray-900 mb-4">Apply Coupon</h3>
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
                    disabled={!couponCode.trim() || validateOfferMutation.isPending}
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
                      disabled={!couponCode.trim() || validateOfferMutation.isPending}
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
          <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
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
