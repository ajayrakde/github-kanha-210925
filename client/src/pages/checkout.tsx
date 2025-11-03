import { useState, useEffect, useCallback } from "react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Loader2, MapPin, Check, ShoppingCart, Home, CreditCard } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { scrollToContext } from "@/lib/scroll-utils";

interface UserInfo {
  name: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  landmark: string;
  city: string;
  pincode: string;
}

const EMPTY_USER_INFO: UserInfo = {
  name: "",
  addressLine1: "",
  addressLine2: "",
  addressLine3: "",
  landmark: "",
  city: "",
  pincode: "",
};

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { cartItems, subtotal, clearCart, isLoading: isCartLoading } = useCart();
  
  const [expandedStep, setExpandedStep] = useState<string>("summary");
  const [completedSteps, setCompletedSteps] = useState({
    summary: false,
    address: false,
    payment: false,
  });
  const [confirmedCartSnapshot, setConfirmedCartSnapshot] = useState<string | null>(null);
  
  const [step, setStep] = useState<"phone" | "otp" | "details">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo>(EMPTY_USER_INFO);
  const [user, setUser] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [makePreferred, setMakePreferred] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(50);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isPincodeValid, setIsPincodeValid] = useState(false);
  const [previousSelectedAddressId, setPreviousSelectedAddressId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [appliedOffer, setAppliedOffer] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false);

  useEffect(() => {
    const selectedOffer = queryClient.getQueryData<{ id: string; code: string } | null>([
      "checkout",
      "selectedOffer"
    ]);
    if (selectedOffer) {
      setAppliedOffer(selectedOffer);
    }
  }, []);

  const calculateDiscount = () => {
    if (!appliedOffer) return 0;

    if (appliedOffer.discountType === 'percentage') {
      const discountAmount = (subtotal * (parseFloat(appliedOffer.discountValue) || 0)) / 100;
      const maxDiscount = appliedOffer.maxDiscount ? (parseFloat(appliedOffer.maxDiscount) || 0) : null;
      return maxDiscount && discountAmount > maxDiscount ? maxDiscount : discountAmount;
    } else {
      return parseFloat(appliedOffer.discountValue) || 0;
    }
  };

  const discount = calculateDiscount();

  const validatePincode = useCallback((pincode: string): boolean => {
    return /^\d{6}$/.test(pincode);
  }, []);

  const calculateShipping = useCallback(async (pincode: string) => {
    if (!validatePincode(pincode)) {
      setShippingCharge(50);
      setIsPincodeValid(false);
      return;
    }

    if (cartItems.length === 0) {
      if (isCartLoading) {
        return;
      }

      setShippingCharge(50);
      setIsPincodeValid(false);
      return;
    }

    setIsCalculatingShipping(true);
    setIsPincodeValid(true);

    try {
      const response = await apiRequest("POST", "/api/shipping/calculate", {
        cartItems,
        pincode,
        orderValue: subtotal
      });
      const result = await response.json();
      setShippingCharge(result.shippingCharge);
    } catch (error) {
      console.error("Error calculating shipping:", error);
      setShippingCharge(50);
    } finally {
      setIsCalculatingShipping(false);
    }
  }, [cartItems, isCartLoading, subtotal, validatePincode]);

  const { data: authData } = useQuery<{ authenticated: boolean; user?: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const { data: addresses } = useQuery<any[]>({
    queryKey: ["/api/auth/addresses"],
    enabled: authData?.authenticated || false,
    retry: false,
  });

  const { data: lastOrderAddress } = useQuery<any>({
    queryKey: ["/api/auth/addresses/last"],
    enabled: authData?.authenticated && addresses && addresses.length > 1,
    retry: false,
  });

  useEffect(() => {
    if (authData?.authenticated && authData.user) {
      setUser(authData.user);
      setStep("details");
      
      if (authData.user.name && !userInfo.name) {
        setUserInfo(prev => ({
          ...prev,
          name: authData.user.name
        }));
      }

      if (!selectedAddressId && addresses && addresses.length > 0) {
        const preferred = addresses.find(addr => addr.isPreferred) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
        }
      }
    }
  }, [authData, addresses, selectedAddressId, userInfo.name]);

  useEffect(() => {
    if (!addresses || addresses.length === 0 || showNewAddressForm) {
      return;
    }

    let effectiveSelectedId = selectedAddressId;

    if (!effectiveSelectedId) {
      const preferred = addresses.find(addr => addr.isPreferred) ?? addresses[0];
      if (preferred) {
        setSelectedAddressId(preferred.id);
        effectiveSelectedId = preferred.id;
      }
    }

    if (!effectiveSelectedId) {
      return;
    }

    const selectedAddress = addresses.find(addr => addr.id === effectiveSelectedId);

    if (!selectedAddress) {
      const fallback = addresses[0];
      if (fallback) {
        setSelectedAddressId(fallback.id);
      }
      return;
    }

    const addressParts = selectedAddress.address.split("\n");
    setUserInfo(prev => ({
      ...prev,
      addressLine1: addressParts[0] || "",
      addressLine2: addressParts[1] || "",
      addressLine3: addressParts[2] || "",
      landmark: "",
      city: selectedAddress.city,
      pincode: selectedAddress.pincode,
    }));

    const isValid = validatePincode(selectedAddress.pincode);
    setIsPincodeValid(isValid);

    if (isValid) {
      calculateShipping(selectedAddress.pincode);
    } else {
      setShippingCharge(50);
    }
  }, [addresses, calculateShipping, selectedAddressId, showNewAddressForm, validatePincode]);

  const sendOtpMutation = useMutation({
    mutationFn: async (): Promise<{ message: string }> => {
      const response = await apiRequest("POST", "/api/auth/send-otp", {
        phone,
        userType: "buyer",
      });
      return await response.json();
    },
    onSuccess: (result) => {
      setStep("otp");
      toast({
        title: "OTP Sent",
        description: result.message ?? "Please check your phone for the verification code",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (): Promise<{ message: string; user?: any; isNewUser?: boolean }> => {
      const response = await apiRequest("POST", "/api/auth/verify-otp", {
        phone,
        otp,
        userType: "buyer",
      });
      return await response.json();
    },
    onSuccess: (result) => {
      if (!result.user) {
        toast({
          title: "Verification Failed",
          description: result.message || "Unable to verify OTP. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setUser(result.user);
      setStep("details");

      if (result.user.name && !userInfo.name) {
        setUserInfo(prev => ({
          ...prev,
          name: result.user.name
        }));
      }

      queryClient.setQueryData(["/api/auth/me"], {
        authenticated: true,
        user: result.user
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/addresses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/orders"] });

      toast({
        title: "Phone Verified",
        description: result.message || "Please fill in your delivery details",
      });
    },
    onError: () => {
      toast({
        title: "Verification Failed",
        description: "Invalid or expired OTP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createAddressMutation = useMutation({
    mutationFn: async (addressData: any) => {
      const response = await apiRequest("POST", "/api/auth/addresses", addressData);
      return await response.json();
    },
    onSuccess: (newAddress: any) => {
      const addressLines = newAddress?.address?.split("\n") ?? [];

      setSelectedAddressId(newAddress?.id ?? "");
      setUserInfo(prev => ({
        ...prev,
        addressLine1: addressLines[0] ?? "",
        addressLine2: addressLines[1] ?? "",
        addressLine3: addressLines[2] ?? "",
        landmark: "",
        city: newAddress?.city ?? "",
        pincode: newAddress?.pincode ?? "",
      }));

      const isValid = newAddress?.pincode ? validatePincode(newAddress.pincode) : false;
      setIsPincodeValid(isValid);
      if (isValid) {
        calculateShipping(newAddress.pincode);
      } else {
        setShippingCharge(50);
      }

      setShowNewAddressForm(false);
      setPreviousSelectedAddressId(null);
      setMakePreferred(false);

      toast({
        title: "Address saved",
        description: "Your new address has been saved successfully",
      });

      setTimeout(() => scrollToContext("address-saved"), 300);

      queryClient.setQueryData(["/api/auth/addresses"], (existing: any[] | undefined) => {
        if (!existing) {
          return newAddress ? [newAddress] : existing;
        }

        const index = existing.findIndex(addr => addr.id === newAddress?.id);
        if (index !== -1) {
          const updated = [...existing];
          updated[index] = newAddress;
          return updated;
        }

        return newAddress ? [...existing, newAddress] : existing;
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/addresses"] });
    },
  });

  const validateOfferMutation = useMutation({
    mutationFn: async (payload: { code: string; userId: string; cartValue: number }) => {
      const response = await apiRequest("POST", "/api/offers/validate", payload);
      const result = await response.json();
      return result;
    },
    onSuccess: (result: any) => {
      if (result.valid) {
        setAppliedOffer(result.offer);
        setCouponError("");
        setCouponCode("");
        queryClient.setQueryData(["checkout", "selectedOffer"], 
          { id: result.offer.id, code: result.offer.code });
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
    onError: () => {
      setCouponError("Failed to validate coupon");
      toast({
        title: "Error",
        description: "Failed to validate coupon",
        variant: "destructive",
      });
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const orderUserInfoSnapshot = {
        ...userInfo,
        ...(showNewAddressForm ? { makePreferred } : {}),
      };
      let addressIdToUse = selectedAddressId || null;

      if (selectedAddressId && makePreferred) {
        await apiRequest("PUT", `/api/auth/addresses/${selectedAddressId}/preferred`, {});
      }

      if (showNewAddressForm && authData?.authenticated) {
        const addressData = {
          name: "Delivery Address",
          address: [userInfo.addressLine1, userInfo.addressLine2, userInfo.addressLine3].filter(line => line.trim()).join('\n'),
          city: userInfo.city,
          pincode: userInfo.pincode,
          isPreferred: makePreferred,
        };
        const newAddress = await createAddressMutation.mutateAsync(addressData);
        addressIdToUse = newAddress?.id ?? addressIdToUse;
      }

      if (authData?.authenticated && (!addresses || addresses.length === 0) && !selectedAddressId && !showNewAddressForm) {
        const addressData = {
          name: "Primary Address",
          address: [userInfo.addressLine1, userInfo.addressLine2, userInfo.addressLine3].filter(line => line.trim()).join('\n'),
          city: userInfo.city,
          pincode: userInfo.pincode,
          isPreferred: true,
        };
        const newAddress = await createAddressMutation.mutateAsync(addressData);
        addressIdToUse = newAddress?.id ?? addressIdToUse;
      }

      let checkoutIntentId: string | undefined;
      
      try {
        const existingIntentStr = sessionStorage.getItem('checkoutIntent');
        if (existingIntentStr) {
          const existingIntent = JSON.parse(existingIntentStr);
          
          const currentCartSignature = cartItems.map(item => `${item.productId}:${item.quantity}`).sort().join(',');
          const existingCartSignature = existingIntent.cartItems?.map((item: any) => `${item.productId}:${item.quantity}`).sort().join(',');
          
          if (currentCartSignature === existingCartSignature && 
              existingIntent.total === (subtotal + shippingCharge - discount) &&
              existingIntent.offerCode === (appliedOffer?.code ?? null)) {
            checkoutIntentId = existingIntent.checkoutIntentId;
            console.log('[Checkout] Reusing checkout intent ID:', checkoutIntentId);
          }
        }
      } catch (error) {
        console.error('[Checkout] Failed to parse existing intent:', error);
      }

      if (!checkoutIntentId) {
        checkoutIntentId = `intent_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        console.log('[Checkout] Created new checkout intent ID:', checkoutIntentId);
      }
      
      const checkoutIntent = {
        checkoutIntentId,
        userInfo: orderUserInfoSnapshot,
        paymentMethod,
        offerCode: appliedOffer?.code ?? null,
        selectedAddressId: addressIdToUse,
        cartItems,
        subtotal,
        discount,
        shippingCharge,
        total: subtotal + shippingCharge - discount,
      };
      
      const intentResponse = await apiRequest("POST", "/api/orders/checkout-intent", checkoutIntent);
      const intentResult = await intentResponse.json();
      
      sessionStorage.setItem('checkoutIntent', JSON.stringify(checkoutIntent));
      console.log('[Checkout] Saved checkout intent to backend:', checkoutIntentId);

      return {
        checkoutIntentId,
        orderUserInfo: orderUserInfoSnapshot,
      };
    },
    onSuccess: async ({ checkoutIntentId, orderUserInfo }) => {
      const isUpiPayment = paymentMethod === 'upi';

      queryClient.setQueryData(["checkout", "selectedOffer"], null);
      
      if (isUpiPayment || paymentMethod === 'cashfree') {
        setLocation(`/payment?intentId=${checkoutIntentId}`);
      } else {
        toast({
          title: "Payment Method Not Supported",
          description: "Please select UPI payment method",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('[Checkout] Place order failed:', error);
      toast({
        title: "Checkout Failed",
        description: "Unable to process your order. Please try again.",
        variant: "destructive",
      });
      setTimeout(() => scrollToContext("checkout-error"), 300);
    },
  });

  useEffect(() => {
    console.log('[Checkout] Place Order Button Validation States:', {
      step,
      hasName: !!userInfo.name,
      hasAddressLine1: !!userInfo.addressLine1,
      hasAddressLine2: !!userInfo.addressLine2,
      hasCity: !!userInfo.city,
      hasPincode: !!userInfo.pincode,
      isPincodeValid,
      isCalculatingShipping,
      isPlacingOrder: placeOrderMutation.isPending,
      buttonShouldBeEnabled: step === "details" && 
        userInfo.name && 
        userInfo.addressLine1 && 
        userInfo.addressLine2 && 
        userInfo.city && 
        userInfo.pincode && 
        isPincodeValid && 
        !isCalculatingShipping && 
        !placeOrderMutation.isPending,
      userInfo,
    });
  }, [step, userInfo, isPincodeValid, isCalculatingShipping, placeOrderMutation.isPending]);

  useEffect(() => {
    if (isCalculatingShipping) {
      setTimeout(() => scrollToContext("pincode-checking"), 100);
    }
  }, [isCalculatingShipping]);

  useEffect(() => {
    if (verifyOtpMutation.isPending) {
      setTimeout(() => scrollToContext("otp-verification"), 100);
    }
  }, [verifyOtpMutation.isPending]);

  useEffect(() => {
    if (placeOrderMutation.isPending) {
      setTimeout(() => scrollToContext("payment-processing"), 100);
    }
  }, [placeOrderMutation.isPending]);

  const total = subtotal + shippingCharge - discount;

  const handleConfirmSummary = () => {
    if (cartItems && cartItems.length > 0) {
      // Save cart snapshot when confirming
      const snapshot = JSON.stringify(cartItems.map(item => ({ id: item.productId, quantity: item.quantity })));
      setConfirmedCartSnapshot(snapshot);
      setCompletedSteps(prev => ({ ...prev, summary: true }));
      setExpandedStep("address");
    }
  };

  const handleProceedToPayment = () => {
    if (userInfo.name && userInfo.addressLine1 && userInfo.addressLine2 && 
        userInfo.city && userInfo.pincode && isPincodeValid && !isCalculatingShipping) {
      setCompletedSteps(prev => ({ ...prev, address: true }));
      setExpandedStep("payment");
    }
  };

  const isAddressComplete = step === "details" && 
    userInfo.name && 
    userInfo.addressLine1 && 
    userInfo.addressLine2 && 
    userInfo.city && 
    userInfo.pincode && 
    isPincodeValid && 
    !isCalculatingShipping;

  // Reset Step 1 completion when cart changes
  useEffect(() => {
    if (completedSteps.summary && cartItems) {
      const currentSnapshot = JSON.stringify(cartItems.map(item => ({ id: item.productId, quantity: item.quantity })));
      if (currentSnapshot !== confirmedCartSnapshot) {
        setCompletedSteps(prev => ({ ...prev, summary: false }));
        setConfirmedCartSnapshot(null);
      }
    }
  }, [cartItems, completedSteps.summary, confirmedCartSnapshot]);

  // Reset Step 2 completion when address becomes invalid or user opens new address form
  useEffect(() => {
    if (completedSteps.address) {
      const addressStillValid = userInfo.name && userInfo.addressLine1 && userInfo.addressLine2 && 
                                userInfo.city && userInfo.pincode && isPincodeValid && !isCalculatingShipping;
      if (!addressStillValid || showNewAddressForm) {
        setCompletedSteps(prev => ({ ...prev, address: false }));
      }
    }
  }, [completedSteps.address, userInfo, isPincodeValid, isCalculatingShipping, showNewAddressForm]);

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">No items in cart</h2>
        <p className="text-gray-600 mb-3 sm:mb-6">Add some products before checkout</p>
        <Button onClick={() => setLocation("/")} data-testid="button-back-to-products">
          Back to Products
        </Button>
      </div>
    );
  }

  const OrderSummaryContent = () => (
    <>
      <div className="space-y-3 mb-4">
        {cartItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3 border border-gray-200 rounded p-3">
            <div className="w-16 h-16 bg-gray-100 rounded">
              {item.product?.imageUrl && (
                <img 
                  src={item.product.imageUrl} 
                  alt={item.product.name}
                  className="w-full h-full object-cover rounded"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{item.product?.name}</h4>
              <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
            </div>
            <div className="text-sm font-medium">
              ₹{(Number(item.product?.price || 0) * item.quantity).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm mb-4 border-t border-gray-200 pt-4">
        <div className="flex justify-between">
          <span className="text-gray-600">Subtotal</span>
          <span data-testid="text-order-subtotal">₹{(subtotal / 1.05).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Tax (5%)</span>
          <span data-testid="text-order-tax">₹{(subtotal - (subtotal / 1.05)).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Shipping</span>
          <span data-testid="text-order-shipping">
            {isCalculatingShipping ? (
              <span className="text-blue-600">Calculating...</span>
            ) : (
              `₹${shippingCharge.toFixed(2)}`
            )}
          </span>
        </div>
        
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount ({appliedOffer?.code})</span>
            <span data-testid="text-order-discount">-₹{discount.toFixed(2)}</span>
          </div>
        )}
        
        <hr className="my-2" />
        <div className="flex justify-between font-semibold text-lg">
          <span>Total</span>
          <span data-testid="text-order-total">₹{total.toFixed(2)}</span>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Apply Coupon</h3>
        {!appliedOffer ? (
          <>
            <div className="flex space-x-2">
              <Input
                type="text"
                placeholder="Enter coupon code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className={`flex-1 text-sm ${couponError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                data-testid="input-coupon-code"
              />
              <Button
                onClick={() => {
                  if (couponCode.trim() && user?.id) {
                    setCouponError("");
                    validateOfferMutation.mutate({
                      code: couponCode.trim(),
                      userId: user.id,
                      cartValue: subtotal
                    });
                  }
                }}
                disabled={!couponCode.trim() || validateOfferMutation.isPending || !user?.id}
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
              <Check className="w-3 h-3 inline mr-1" />
              "{appliedOffer.code}" applied
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAppliedOffer(null);
                setCouponError("");
                setCouponCode("");
                queryClient.setQueryData(["checkout", "selectedOffer"], null);
                toast({
                  title: "Coupon Removed",
                  description: "The coupon has been removed from your order",
                });
              }}
              className="text-gray-500 hover:text-red-600 h-6 px-2 text-xs"
              data-testid="button-remove-coupon"
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="max-w-7xl mx-auto px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            onClick={() => setLocation("/")}
            variant="ghost"
            className="-ml-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900"
            data-testid="button-back-to-products"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Checkout</h2>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Accordion 
              type="single" 
              value={expandedStep} 
              onValueChange={setExpandedStep}
              collapsible
              className="space-y-4"
            >
              <AccordionItem value="summary" className="border border-gray-200 rounded bg-white">
                <AccordionTrigger className="px-4 sm:px-6 hover:no-underline" data-testid="accordion-trigger-summary">
                  <div className="flex items-center gap-3">
                    {completedSteps.summary ? (
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Step 1: Order Summary</span>
                      <span className="text-xs text-gray-500">Review your cart items</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 sm:px-6 pb-4">
                  <div className="lg:hidden">
                    <OrderSummaryContent />
                  </div>
                  <div className="hidden lg:block text-sm text-gray-600 mb-4">
                    Your cart contains {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}. Review the order summary on the right.
                  </div>
                  <Button
                    onClick={handleConfirmSummary}
                    className="w-full"
                    data-testid="button-confirm-summary"
                  >
                    Confirm & Continue
                  </Button>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="address" className="border border-gray-200 rounded bg-white">
                <AccordionTrigger className="px-4 sm:px-6 hover:no-underline" data-testid="accordion-trigger-address">
                  <div className="flex items-center gap-3">
                    {completedSteps.address ? (
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center">
                        <Home className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Step 2: Delivery Address</span>
                      <span className="text-xs text-gray-500">
                        {completedSteps.address ? "Address confirmed" : "Enter delivery details"}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 sm:px-6 pb-4">
                  {step === "phone" && !authData?.authenticated && (
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">Phone Verification</h3>
                      <div>
                        <Label htmlFor="phone">Phone Number</Label>
                        <div className="flex mt-2">
                          <span className="inline-flex items-center px-3 rounded-l border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                            +91
                          </span>
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="9876543210"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="rounded-l-none"
                            data-testid="input-phone"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() => sendOtpMutation.mutate()}
                        disabled={!phone || sendOtpMutation.isPending}
                        data-testid="button-send-otp"
                      >
                        {sendOtpMutation.isPending ? "Sending..." : "Send OTP"}
                      </Button>
                    </div>
                  )}

                  {step === "otp" && !authData?.authenticated && (
                    <div className="space-y-4">
                      <h3 className="font-medium text-gray-900">Enter OTP</h3>
                      <div>
                        <Label htmlFor="otp">6-Digit OTP</Label>
                        <div className="flex justify-center sm:justify-start mt-2">
                          <InputOTP 
                            maxLength={6} 
                            value={otp}
                            onChange={(value) => setOtp(value)}
                            data-testid="input-otp"
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} className="h-12 w-12" />
                              <InputOTPSlot index={1} className="h-12 w-12" />
                              <InputOTPSlot index={2} className="h-12 w-12" />
                              <InputOTPSlot index={3} className="h-12 w-12" />
                              <InputOTPSlot index={4} className="h-12 w-12" />
                              <InputOTPSlot index={5} className="h-12 w-12" />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <Button
                          onClick={() => verifyOtpMutation.mutate()}
                          disabled={!otp || verifyOtpMutation.isPending}
                          data-testid="button-verify-otp"
                        >
                          {verifyOtpMutation.isPending ? "Verifying..." : "Verify OTP"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => sendOtpMutation.mutate()}
                          disabled={sendOtpMutation.isPending}
                          data-testid="button-resend-otp"
                        >
                          Resend OTP
                        </Button>
                      </div>
                    </div>
                  )}

                  {step === "details" && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          type="text"
                          placeholder="John Doe"
                          value={userInfo.name}
                          onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })}
                          className="mt-2"
                          data-testid="input-name"
                        />
                      </div>

                      {addresses && addresses.length > 0 && (
                        <>
                          {(() => {
                            const preferredAddress = addresses.find(addr => addr.isPreferred);
                            return preferredAddress && !showNewAddressForm ? (
                              <div>
                                <Label className="text-base font-medium">Preferred Address</Label>
                                <div
                                  className={`mt-2 border rounded p-4 cursor-pointer transition-colors ${
                                    selectedAddressId === preferredAddress.id
                                      ? 'border-blue-500 bg-blue-50'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => {
                                    setShowNewAddressForm(false);
                                    setSelectedAddressId(preferredAddress.id);
                                  }}
                                  data-testid={`preferred-address-${preferredAddress.id}`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                      <input
                                        type="radio"
                                        name="addressSelection"
                                        checked={selectedAddressId === preferredAddress.id}
                                        onChange={() => {}}
                                        className="mt-1"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-medium">{preferredAddress.name}</h4>
                                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                            Preferred
                                          </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">
                                          {preferredAddress.address}, {preferredAddress.city} - {preferredAddress.pincode}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {!showNewAddressForm && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setPreviousSelectedAddressId(selectedAddressId || null);
                                setSelectedAddressId("");
                                setShowNewAddressForm(true);
                                setMakePreferred(false);
                                setUserInfo(prev => ({
                                  ...EMPTY_USER_INFO,
                                  name: prev.name,
                                }));
                                setIsPincodeValid(false);
                                setShippingCharge(50);
                              }}
                              className="w-full"
                              data-testid="button-use-different-address"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Use Different Address
                            </Button>
                          )}
                        </>
                      )}

                      {(showNewAddressForm || (!addresses || addresses.length === 0)) && (
                        <div className="space-y-4">
                          {showNewAddressForm && (
                            <div className="flex items-center justify-between bg-blue-50 p-3 rounded">
                              <span className="text-sm text-blue-800">Adding new address</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowNewAddressForm(false);
                                  if (previousSelectedAddressId) {
                                    setSelectedAddressId(previousSelectedAddressId);
                                  }
                                  setPreviousSelectedAddressId(null);
                                  setMakePreferred(false);
                                }}
                                className="text-xs"
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                          <div>
                            <Label htmlFor="addressLine1">Address Line 1 *</Label>
                            <Input
                              id="addressLine1"
                              type="text"
                              placeholder="House/Flat No, Building Name"
                              value={userInfo.addressLine1}
                              onChange={(e) => setUserInfo({ ...userInfo, addressLine1: e.target.value })}
                              className="mt-2"
                              data-testid="input-address-line1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="addressLine2">Address Line 2 *</Label>
                            <Input
                              id="addressLine2"
                              type="text"
                              placeholder="Street Name, Area"
                              value={userInfo.addressLine2}
                              onChange={(e) => setUserInfo({ ...userInfo, addressLine2: e.target.value })}
                              className="mt-2"
                              data-testid="input-address-line2"
                            />
                          </div>
                          <div>
                            <Label htmlFor="addressLine3">Address Line 3</Label>
                            <Input
                              id="addressLine3"
                              type="text"
                              placeholder="Sector, Locality (Optional)"
                              value={userInfo.addressLine3}
                              onChange={(e) => setUserInfo({ ...userInfo, addressLine3: e.target.value })}
                              className="mt-2"
                              data-testid="input-address-line3"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="city">City *</Label>
                              <Input
                                id="city"
                                type="text"
                                placeholder="Mumbai"
                                value={userInfo.city}
                                onChange={(e) => setUserInfo({ ...userInfo, city: e.target.value })}
                                className="mt-2"
                                data-testid="input-city"
                              />
                            </div>
                            <div>
                              <Label htmlFor="pincode">PIN Code *</Label>
                              <Input
                                id="pincode"
                                type="text"
                                placeholder="400001"
                                maxLength={6}
                                value={userInfo.pincode}
                                onChange={(e) => {
                                  const newPincode = e.target.value;
                                  setUserInfo({ ...userInfo, pincode: newPincode });
                                  
                                  if (validatePincode(newPincode)) {
                                    calculateShipping(newPincode);
                                  } else {
                                    setIsPincodeValid(false);
                                    setShippingCharge(50);
                                  }
                                }}
                                className={`mt-2 ${!validatePincode(userInfo.pincode) && userInfo.pincode ? 'border-red-500' : ''}`}
                                data-testid="input-pincode"
                              />
                              {userInfo.pincode && !validatePincode(userInfo.pincode) && (
                                <p className="text-red-500 text-sm mt-1">PIN code must be exactly 6 digits</p>
                              )}
                            </div>
                          </div>

                          {authData?.authenticated && (
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="makePreferredNew"
                                checked={makePreferred}
                                onCheckedChange={(checked) => setMakePreferred(checked as boolean)}
                              />
                              <Label htmlFor="makePreferredNew" className="text-sm">
                                Save this address and set as preferred
                              </Label>
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        onClick={handleProceedToPayment}
                        disabled={!isAddressComplete}
                        className="w-full"
                        data-testid="button-proceed-to-payment"
                      >
                        {isCalculatingShipping ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Calculating shipping...
                          </>
                        ) : (
                          "Proceed to Payment"
                        )}
                      </Button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="payment" className="border border-gray-200 rounded bg-white">
                <AccordionTrigger className="px-4 sm:px-6 hover:no-underline" data-testid="accordion-trigger-payment">
                  <div className="flex items-center gap-3">
                    {completedSteps.payment ? (
                      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">Step 3: Payment</span>
                      <span className="text-xs text-gray-500">Choose payment method</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 sm:px-6 pb-4">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-medium mb-3 block">Payment Method</Label>
                      <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                        <div className="flex items-center space-x-2 border border-gray-200 rounded p-3">
                          <RadioGroupItem value="upi" id="upi" />
                          <Label htmlFor="upi" className="flex-1 cursor-pointer">UPI Payment</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <Button
                      onClick={() => {
                        console.log('[Checkout] Place Order button clicked');
                        placeOrderMutation.mutate();
                      }}
                      disabled={!completedSteps.summary || !completedSteps.address || placeOrderMutation.isPending}
                      className="w-full bg-green-600 hover:bg-green-700"
                      data-testid="button-place-order"
                    >
                      {placeOrderMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Place Order - ₹{total.toFixed(2)}
                        </>
                      )}
                    </Button>

                    <div className="text-xs text-gray-500 flex items-center justify-center">
                      <Check className="w-3 h-3 mr-1" />
                      Secure checkout with 256-bit SSL encryption
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="lg:col-span-1 hidden lg:block">
            <div className="bg-white border border-gray-200 rounded p-6 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
              <OrderSummaryContent />
            </div>
          </div>
        </div>
      </div>

      {isAddressSheetOpen && addresses && addresses.length > 1 && (
        <BottomSheet
          open={isAddressSheetOpen}
          onOpenChange={setIsAddressSheetOpen}
          title="Select Address"
        >
          <div className="space-y-3 pb-6">
            {addresses.filter(addr => !addr.isPreferred).map((address) => (
              <div
                key={address.id}
                className={`border rounded p-3 cursor-pointer transition-colors ${
                  selectedAddressId === address.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
                onClick={() => {
                  setShowNewAddressForm(false);
                  setSelectedAddressId(address.id);
                  setIsAddressSheetOpen(false);
                }}
                data-testid={`address-option-${address.id}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="addressSelection"
                    checked={selectedAddressId === address.id}
                    onChange={() => {}}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{address.name}</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      {address.address}, {address.city} - {address.pincode}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
