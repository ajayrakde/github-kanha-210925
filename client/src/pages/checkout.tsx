import { useState } from "react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

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
  const { cartItems, subtotal } = useCart();
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

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/orders", {
        userId: user.id,
        userInfo,
        paymentMethod,
      });
      return await response.json();
    },
    onSuccess: (data) => {
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
