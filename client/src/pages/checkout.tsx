import { useState, useEffect } from "react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft, Plus } from "lucide-react";

interface UserInfo {
  name: string;
  email: string;
  address: string;
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
    email: "",
    address: "",
    city: "",
    pincode: "",
  });
  const [user, setUser] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [makePreferred, setMakePreferred] = useState(false);

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

  useEffect(() => {
    if (authData?.authenticated && authData.user) {
      setUser(authData.user);
      setStep("details");
      
      // Pre-select preferred address if available
      if (addresses && addresses.length > 0) {
        const preferred = addresses.find(addr => addr.isPreferred);
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setUserInfo({
            name: authData.user.name || "",
            email: authData.user.email || "",
            address: preferred.address,
            city: preferred.city,
            pincode: preferred.pincode,
          });
        }
      }
    }
  }, [authData, addresses]);

  const sendOtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/otp/send", { phone });
      return await response.json();
    },
    onSuccess: () => {
      setStep("otp");
      toast({
        title: "OTP Sent",
        description: "Please check your phone for the verification code",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/otp/verify", { phone, otp });
      return await response.json();
    },
    onSuccess: (result) => {
      if (result.verified) {
        setUser(result.user);
        setStep("details");
        toast({
          title: "Phone Verified",
          description: "Please fill in your delivery details",
        });
      }
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
      if (showNewAddressForm) {
        const addressData = {
          name: "Delivery Address",
          address: userInfo.address,
          city: userInfo.city,
          pincode: userInfo.pincode,
          isPreferred: makePreferred,
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

  const total = subtotal + 50; // Add shipping charges

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

                {/* User Name and Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                  <div>
                    <Label htmlFor="email">Email (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={userInfo.email}
                      onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                      className="mt-2"
                      data-testid="input-email"
                    />
                  </div>
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
                              setUserInfo({
                                ...userInfo,
                                address: preferredAddress.address,
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
                                    setUserInfo({
                                      ...userInfo,
                                      address: address.address,
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
                    
                    <div className="md:col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        placeholder="House/Building, Street, Area"
                        rows={3}
                        value={userInfo.address}
                        onChange={(e) => setUserInfo({ ...userInfo, address: e.target.value })}
                        className="mt-2"
                        data-testid="input-address"
                      />
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
                          value={userInfo.pincode}
                          onChange={(e) => setUserInfo({ ...userInfo, pincode: e.target.value })}
                          className="mt-2"
                          data-testid="input-pincode"
                        />
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
                    <div className="md:col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        placeholder="House/Building, Street, Area"
                        rows={3}
                        value={userInfo.address}
                        onChange={(e) => setUserInfo({ ...userInfo, address: e.target.value })}
                        className="mt-2"
                        data-testid="input-address"
                      />
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
                          value={userInfo.pincode}
                          onChange={(e) => setUserInfo({ ...userInfo, pincode: e.target.value })}
                          className="mt-2"
                          data-testid="input-pincode"
                        />
                      </div>
                    </div>

                    {authData?.authenticated && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="makePreferredFirst"
                          checked={makePreferred}
                          onCheckedChange={(checked) => setMakePreferred(checked as boolean)}
                        />
                        <Label htmlFor="makePreferredFirst" className="text-sm">
                          Save this address as preferred
                        </Label>
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
                <span data-testid="text-order-shipping">₹50.00</span>
              </div>
              <hr />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span data-testid="text-order-total">₹{(subtotal + 50).toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="text-xs text-gray-500 flex items-center">
                <i className="fas fa-shield-alt mr-1"></i>
                Secure checkout with 256-bit SSL encryption
              </div>
              <div className="text-xs text-gray-500 flex items-center">
                <i className="fas fa-truck mr-1"></i>
                Delivery across India - ₹50
              </div>
            </div>

            {step === "details" && (
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => placeOrderMutation.mutate()}
                disabled={!userInfo.name || !userInfo.address || !userInfo.city || !userInfo.pincode || placeOrderMutation.isPending}
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
