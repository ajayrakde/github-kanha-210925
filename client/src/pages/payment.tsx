import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ArrowLeft, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderData {
  orderId: string;
  total: string;
  subtotal: string;
  discountAmount: string;
  paymentMethod: string;
  deliveryAddress: string;
  userInfo: {
    name: string;
    email: string;
    phone?: string;
  };
}

export default function Payment() {
  const [location, setLocation] = useLocation();
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderId, setOrderId] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const { toast } = useToast();

  // Extract orderId from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('orderId');
    
    if (orderIdParam) {
      setOrderId(orderIdParam);
      
      // Get order data from session storage
      const storedOrder = sessionStorage.getItem('lastOrder');
      if (storedOrder) {
        const orderInfo = JSON.parse(storedOrder) as OrderData;
        if (orderInfo.orderId === orderIdParam) {
          setOrderData(orderInfo);
        }
      }
    }
  }, [location]);

  // Fetch order details from API if not in session storage
  const { data: order, isLoading: isLoadingOrder } = useQuery<OrderData>({
    queryKey: ["/api/orders", orderId],
    enabled: Boolean(orderId) && !orderData,
    retry: false
  });

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const currentOrderData = orderData || order;
      if (!currentOrderData) throw new Error('No order data available');
      
      const response = await apiRequest("POST", "/api/payments/create", {
        orderId: orderId,
        amount: parseFloat(currentOrderData.total),
        redirectUrl: `${window.location.origin}/payment/success?orderId=${orderId}`,
        callbackUrl: `${window.location.origin}/api/payments/webhook/phonepe`,
        mobileNumber: currentOrderData.userInfo.phone
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      setPaymentStatus('processing');
      
      // Check if we have a payment URL to redirect to
      if (data.data && data.data.redirectUrl) {
        // For PhonePe, redirect to their payment page
        window.location.href = data.data.redirectUrl;
      } else {
        toast({
          title: "Payment Error",
          description: "Unable to initiate payment. Please try again.",
          variant: "destructive"
        });
        setPaymentStatus('failed');
      }
    },
    onError: (error) => {
      console.error('Payment creation failed:', error);
      toast({
        title: "Payment Failed",
        description: "Unable to process payment. Please try again.",
        variant: "destructive"
      });
      setPaymentStatus('failed');
    }
  });

  // Payment status checking mutation
  const checkPaymentStatusMutation = useMutation({
    mutationFn: async (merchantTransactionId: string) => {
      const response = await apiRequest("GET", `/api/payments/status/${merchantTransactionId}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data && data.data.statusResponse && data.data.statusResponse.data) {
        const status = data.data.statusResponse.data.state;
        if (status === 'COMPLETED') {
          setPaymentStatus('completed');
          toast({
            title: "Payment Successful",
            description: "Your payment has been completed successfully!",
          });
          setTimeout(() => {
            setLocation("/thank-you");
          }, 2000);
        } else if (status === 'FAILED') {
          setPaymentStatus('failed');
          toast({
            title: "Payment Failed",
            description: "Your payment could not be processed. Please try again.",
            variant: "destructive"
          });
        }
      }
    }
  });

  const currentOrderData = orderData || order;
  const isLoading = isLoadingOrder || createPaymentMutation.isPending;

  // Handle back to checkout
  const handleBackToCheckout = () => {
    setLocation("/checkout");
  };

  // Handle retry payment
  const handleRetryPayment = () => {
    setPaymentStatus('pending');
    createPaymentMutation.mutate();
  };

  // Handle payment initiation
  const handleInitiatePayment = () => {
    if (currentOrderData) {
      createPaymentMutation.mutate();
    }
  };

  if (!orderId) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Payment Link</h2>
            <p className="text-gray-600 mb-4">No order information found. Please start checkout again.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-back-to-products">
              Back to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading && !currentOrderData) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading order details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentOrderData) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Order Not Found</h2>
            <p className="text-gray-600 mb-4">We couldn't find the order information. Please try again.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-back-to-products">
              Back to Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Back Button */}
      <Button 
        onClick={handleBackToCheckout}
        variant="ghost" 
        className="-ml-2 mb-4 hover:bg-gray-100"
        data-testid="button-back-to-checkout"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Checkout
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Complete Payment</h1>
        <p className="text-gray-600">Secure payment powered by PhonePe</p>
      </div>

      {/* Order Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Order ID:</span>
            <span className="font-mono font-medium" data-testid="text-order-id">
              {orderId.slice(0, 8)}...
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span data-testid="text-subtotal">₹{parseFloat(currentOrderData.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(currentOrderData.discountAmount) > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount:</span>
              <span data-testid="text-discount">-₹{parseFloat(currentOrderData.discountAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>Shipping:</span>
            <span data-testid="text-shipping">₹50.00</span>
          </div>
          <hr className="my-2" />
          <div className="flex justify-between font-semibold text-lg">
            <span>Total:</span>
            <span data-testid="text-total">₹{parseFloat(currentOrderData.total).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CreditCard className="mr-2 h-5 w-5" />
            Payment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentStatus === 'pending' && (
            <div className="text-center py-6">
              <div className="mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Pay</h3>
                <p className="text-gray-600 mb-6">
                  You'll be redirected to PhonePe to complete your payment securely.
                </p>
              </div>
              <Button 
                onClick={handleInitiatePayment}
                disabled={isLoading}
                size="lg"
                className="w-full"
                data-testid="button-initiate-payment"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay ₹{parseFloat(currentOrderData.total).toFixed(2)} with PhonePe
                  </>
                )}
              </Button>
            </div>
          )}

          {paymentStatus === 'processing' && (
            <div className="text-center py-6">
              <div className="mb-4">
                <Loader2 className="h-16 w-16 text-blue-600 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Payment</h3>
                <p className="text-gray-600">Please complete the payment in the PhonePe app or website.</p>
              </div>
            </div>
          )}

          {paymentStatus === 'completed' && (
            <div className="text-center py-6">
              <div className="mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-check text-green-600 text-2xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Successful!</h3>
                <p className="text-gray-600">Your payment has been processed successfully. Redirecting...</p>
              </div>
            </div>
          )}

          {paymentStatus === 'failed' && (
            <div className="text-center py-6">
              <div className="mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Failed</h3>
                <p className="text-gray-600 mb-6">Your payment could not be processed. Please try again.</p>
              </div>
              <div className="space-y-3">
                <Button 
                  onClick={handleRetryPayment}
                  disabled={isLoading}
                  size="lg"
                  className="w-full"
                  data-testid="button-retry-payment"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Retry Payment
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleBackToCheckout}
                  className="w-full"
                  data-testid="button-back-to-checkout-failed"
                >
                  Back to Checkout
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}