import { useState, useEffect } from "react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Plus } from "lucide-react";

interface UserInfo {
  name: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  landmark: string;
  city: string;
  pincode: string;
}

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { cartItems, subtotal, clearCart } = useCart();
  const [step, setStep] = useState<"phone" | "otp" | "details">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "",
    addressLine1: "",
    addressLine2: "",
    addressLine3: "",
    landmark: "",
    city: "",
    pincode: "",
  });
  const [user, setUser] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [makePreferred, setMakePreferred] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(50); // Default shipping
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [isPincodeValid, setIsPincodeValid] = useState(false);

  // Function to validate pincode (6 digits)
  const validatePincode = (pincode: string): boolean => {
    return /^\d{6}$/.test(pincode);
  };

  // Function to calculate shipping charges
  const calculateShipping = async (pincode: string) => {
    if (!validatePincode(pincode) || cartItems.length === 0) {
      setShippingCharge(50); // Default fallback
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
      setShippingCharge(50); // Fall back to default
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  // Check if user is already logged in
  const { data: authData } = useQuery<{ authenticated: boolean; user?: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  // Get user addresses if logged in
  const { data: addresses } = useQuery<any[]>({
    queryKey: ["/api/auth/addresses"],
    enabled: authData?.authenticated || false,
    retry: false,
  });

  // Get last order's delivery address if logged in
  const { data: lastOrderAddress } = useQuery<any>({
    queryKey: ["/api/auth/addresses/last"],
    enabled: authData?.authenticated && addresses && addresses.length > 1,
    retry: false,
  });

  useEffect(() => {
    if (authData?.authenticated && authData.user) {
      setUser(authData.user);
      setStep("details");
      
      // Auto-populate name from user data if available and not already set
      if (authData.user.name && !userInfo.name) {
        setUserInfo(prev => ({
          ...prev,
          name: authData.user.name
        }));
      }
      
      // Pre-select preferred address if available
      if (addresses && addresses.length > 0) {
        const preferred = addresses.find(addr => addr.isPreferred);
        if (preferred) {
          setSelectedAddressId(preferred.id);
          // Parse address back to lines (temporary - we'll improve this later)
          const addressParts = preferred.address.split('\n');
          setUserInfo(prev => ({
            ...prev,
            name: authData.user.name || prev.name, // Keep existing name if user already filled it
            addressLine1: addressParts[0] || "",
            addressLine2: addressParts[1] || "",
            addressLine3: addressParts[2] || "",
            landmark: "", // Will be empty for existing addresses
            city: preferred.city,
            pincode: preferred.pincode,
          }));
        }
      }
    }
  }, [authData, addresses]);

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

      // Auto-populate name from user data if available
      if (result.user.name && !userInfo.name) {
        setUserInfo(prev => ({
          ...prev,
          name: result.user.name
        }));
      }

      // Update authentication cache to reflect logged-in state
      queryClient.setQueryData(["/api/auth/me"], {
        authenticated: true,
        user: result.user
      });

      // Invalidate queries to refresh user data
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
    onSuccess: () => {
      setShowNewAddressForm(false);
      toast({
        title: "Address saved",
        description: "Your new address has been saved successfully",
      });
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      // If user selected an existing address, save it if marked as preferred
      if (selectedAddressId && makePreferred) {
        await apiRequest("PUT", `/api/auth/addresses/${selectedAddressId}/preferred`, {});
      }
      
      // If user is adding a new address, create it first
      if (showNewAddressForm && authData?.authenticated) {
        const addressData = {
          name: "Delivery Address",
          address: [userInfo.addressLine1, userInfo.addressLine2, userInfo.addressLine3].filter(line => line.trim()).join('\n'),
          city: userInfo.city,
          pincode: userInfo.pincode,
          isPreferred: makePreferred,
        };
        await createAddressMutation.mutateAsync(addressData);
      }
      
      // For logged-in users with no saved addresses, automatically save the current address
      if (authData?.authenticated && (!addresses || addresses.length === 0) && !selectedAddressId && !showNewAddressForm) {
        const addressData = {
          name: "Primary Address",
          address: [userInfo.addressLine1, userInfo.addressLine2, userInfo.addressLine3].filter(line => line.trim()).join('\n'),
          city: userInfo.city,
          pincode: userInfo.pincode,
          isPreferred: true, // First address becomes preferred automatically
        };
        await createAddressMutation.mutateAsync(addressData);
      }

      const response = await apiRequest("POST", "/api/orders", {
        userId: user.id,
        userInfo,
        paymentMethod,
      });
      return await response.json();
    },
    onSuccess: async (data) => {
      // Clear the cart after successful order
      clearCart.mutate();
      // Invalidate orders cache to show the new order
      queryClient.invalidateQueries({ queryKey: ["/api/auth/orders"] });
      // Store order data in session storage for thank you page
      sessionStorage.setItem('lastOrder', JSON.stringify({
        orderId: data.order.id,
        total: data.order.total,
        subtotal: data.order.subtotal,
        discountAmount: data.order.discountAmount,
        paymentMethod: data.order.paymentMethod,
        deliveryAddress: data.order.deliveryAddress,
        userInfo: userInfo
      }));
      setLocation("/thank-you");
    },
  });

  const total = subtotal + shippingCharge; // Add dynamic shipping charges

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">No items in cart</h2>
        <p className="text-gray-600 mb-6">Add some products before checkout</p>
        <Button onClick={() => setLocation("/")} data-testid="button-back-to-products">
          Back to Products
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button 
        onClick={() => setLocation("/")}
        variant="ghost" 
        className="-ml-2 mb-2 hover:bg-gray-100"
        data-testid="button-back-to-products"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Checkout</h2>
        <p className="text-gray-600">Complete your order with secure payment</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Phone Verification */}
          {step === "phone" && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <i className="fas fa-mobile-alt text-blue-600 mr-2"></i>
                Phone Verification
              </h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="flex mt-2">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
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
                  Send OTP
                </Button>
              </div>
            </div>
          )}

          {/* OTP Verification */}
          {step === "otp" && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <i className="fas fa-shield-alt text-green-600 mr-2"></i>
                Enter OTP
              </h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="otp">6-Digit OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="123456"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-40 text-center font-mono text-lg mt-2"
                    data-testid="input-otp"
                  />
                </div>
                <div className="flex space-x-3">
                  <Button
                    onClick={() => verifyOtpMutation.mutate()}
                    disabled={!otp || verifyOtpMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-verify-otp"
                  >
                    Verify OTP
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
            </div>
          )}

          {/* Delivery Information */}
          {step === "details" && (
            <>
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <i className="fas fa-truck text-blue-600 mr-2"></i>
                  Delivery Information
                </h3>

                {/* User Name */}
                <div className="mb-6">
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

                {/* Address Selection/Management */}
                {addresses && addresses.length > 0 && (
                  <>
                    {/* Preferred Address Card (shown above form) */}
                    {(() => {
                      const preferredAddress = addresses.find(addr => addr.isPreferred);
                      return preferredAddress && !showNewAddressForm ? (
                        <div className="mb-6">
                          <Label className="text-base font-medium">Preferred Address</Label>
                          <div
                            className={`mt-2 border rounded-lg p-4 cursor-pointer transition-colors ${
                              selectedAddressId === preferredAddress.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => {
                              setSelectedAddressId(preferredAddress.id);
                              const addressParts = preferredAddress.address.split('\n');
                              setUserInfo({
                                ...userInfo,
                                addressLine1: addressParts[0] || "",
                                addressLine2: addressParts[1] || "",
                                addressLine3: addressParts[2] || "",
                                landmark: "",
                                city: preferredAddress.city,
                                pincode: preferredAddress.pincode,
                              });
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

                    {/* Option to use different address or add new */}
                    {!showNewAddressForm && (
                      <div className="space-y-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowNewAddressForm(true)}
                          className="w-full"
                          data-testid="button-use-different-address"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Use Different Address
                        </Button>
                        
                        {addresses.length > 1 && (
                          <details className="group">
                            <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                              Choose from other saved addresses
                            </summary>
                            <div className="mt-2 space-y-2">
                              {addresses.filter(addr => !addr.isPreferred).map((address) => (
                                <div
                                  key={address.id}
                                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                                    selectedAddressId === address.id
                                      ? 'border-blue-500 bg-blue-50'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => {
                                    setSelectedAddressId(address.id);
                                    const addressParts = address.address.split('\n');
                                    setUserInfo({
                                      ...userInfo,
                                      addressLine1: addressParts[0] || "",
                                      addressLine2: addressParts[1] || "",
                                      addressLine3: addressParts[2] || "",
                                      landmark: "",
                                      city: address.city,
                                      pincode: address.pincode,
                                    });
                                  }}
                                  data-testid={`address-option-${address.id}`}
                                >
                                  <div className="flex items-start justify-between">
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
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* New Address Form */}
                {showNewAddressForm && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">Add New Address</Label>
                      {addresses && addresses.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowNewAddressForm(false)}
                          data-testid="button-cancel-new-address"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    
                    <div className="space-y-4">
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
                      <div>
                        <Label htmlFor="landmark">Nearest Landmark</Label>
                        <Input
                          id="landmark"
                          type="text"
                          placeholder="Near Mall, School, etc. (Optional)"
                          value={userInfo.landmark}
                          onChange={(e) => setUserInfo({ ...userInfo, landmark: e.target.value })}
                          className="mt-2"
                          data-testid="input-landmark"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
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
                        <Label htmlFor="pincode">PIN Code</Label>
                        <Input
                          id="pincode"
                          type="text"
                          placeholder="400001"
                          maxLength={6}
                          value={userInfo.pincode}
                          onChange={(e) => {
                            const newPincode = e.target.value;
                            setUserInfo({ ...userInfo, pincode: newPincode });
                            
                            // Validate and calculate shipping on every change
                            if (validatePincode(newPincode)) {
                              calculateShipping(newPincode);
                            } else {
                              setIsPincodeValid(false);
                              setShippingCharge(50); // Default fallback
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

                {/* Show address form for users with no saved addresses */}
                {(!addresses || addresses.length === 0) && !showNewAddressForm && (
                  <div className="space-y-4">
                    <div className="space-y-4">
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
                      <div>
                        <Label htmlFor="landmark">Nearest Landmark</Label>
                        <Input
                          id="landmark"
                          type="text"
                          placeholder="Near Mall, School, etc. (Optional)"
                          value={userInfo.landmark}
                          onChange={(e) => setUserInfo({ ...userInfo, landmark: e.target.value })}
                          className="mt-2"
                          data-testid="input-landmark"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
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
                        <Label htmlFor="pincode">PIN Code</Label>
                        <Input
                          id="pincode"
                          type="text"
                          placeholder="400001"
                          maxLength={6}
                          value={userInfo.pincode}
                          onChange={(e) => {
                            const newPincode = e.target.value;
                            setUserInfo({ ...userInfo, pincode: newPincode });
                            
                            // Validate and calculate shipping on every change
                            if (validatePincode(newPincode)) {
                              calculateShipping(newPincode);
                            } else {
                              setIsPincodeValid(false);
                              setShippingCharge(50); // Default fallback
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
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm text-blue-800">
                          ✓ This address will be saved automatically for future orders
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <i className="fas fa-credit-card text-blue-600 mr-2"></i>
                  Payment Method
                </h3>
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                  <div className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg">
                    <RadioGroupItem value="upi" id="upi" />
                    <Label htmlFor="upi" className="flex items-center cursor-pointer">
                      <i className="fas fa-mobile-alt text-green-600 mr-2"></i>
                      <span className="font-medium">UPI Payment</span>
                      <span className="ml-2 text-sm text-gray-500">(Recommended)</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg opacity-50">
                    <RadioGroupItem value="cod" id="cod" disabled />
                    <Label htmlFor="cod" className="flex items-center">
                      <i className="fas fa-money-bill-wave text-gray-400 mr-2"></i>
                      <span className="font-medium">Cash on Delivery</span>
                      <span className="ml-2 text-sm text-gray-500">(Coming Soon)</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-6 sticky top-24">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
            <div className="space-y-3 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal ({cartItems.length} items)</span>
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
              <hr />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span data-testid="text-order-total">₹{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="text-xs text-gray-500 flex items-center">
                <i className="fas fa-shield-alt mr-1"></i>
                Secure checkout with 256-bit SSL encryption
              </div>
              <div className="text-xs text-gray-500 flex items-center">
                <i className="fas fa-truck mr-1"></i>
                Delivery across India - ₹{shippingCharge}
              </div>
            </div>

            {step === "details" && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => placeOrderMutation.mutate()}
                disabled={
                  !userInfo.name || 
                  !userInfo.addressLine1 || 
                  !userInfo.addressLine2 || 
                  !userInfo.city || 
                  !userInfo.pincode || 
                  !isPincodeValid || 
                  isCalculatingShipping || 
                  placeOrderMutation.isPending
                }
                data-testid="button-place-order"
              >
                <i className="fas fa-lock mr-2"></i>
                Place Order - ₹{total.toFixed(2)}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
