import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CreditCard, ArrowLeft, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";

type PhonePeCheckoutEvent = {
  status?: string;
  data?: {
    merchantTransactionId?: string;
    [key: string]: unknown;
  };
};

type PhonePeCheckoutInstance = {
  transact: (options: {
    tokenUrl: string;
    callback: (event: PhonePeCheckoutEvent) => void;
    type: string;
  }) => void;
};

declare global {
  interface Window {
    PhonePeCheckout?: PhonePeCheckoutInstance;
  }
}

const PHONEPE_CHECKOUT_SRC = "https://checkout.phonepe.com/v3/checkout.js";

type PhonePeInstrumentPreference = "UPI_INTENT" | "UPI_COLLECT" | "UPI_QR";

const PHONEPE_INSTRUMENT_OPTIONS: Array<{
  value: PhonePeInstrumentPreference;
  label: string;
  description: string;
  testId: string;
}> = [
  {
    value: "UPI_INTENT",
    label: "UPI Intent",
    description: "Launches your preferred UPI app to approve the payment",
    testId: "button-select-upi_intent",
  },
  {
    value: "UPI_COLLECT",
    label: "UPI Collect",
    description: "We send a collect request to your UPI app for approval",
    testId: "button-select-upi_collect",
  },
  {
    value: "UPI_QR",
    label: "UPI QR",
    description: "Scan a QR code from any UPI app to complete payment",
    testId: "button-select-upi_qr",
  },
];

interface PhonePeTokenResponse {
  tokenUrl?: string;
  merchantTransactionId?: string;
  paymentId?: string;
}

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
  cashfreePaymentSessionId?: string;
  items?: Array<{
    id: string;
    productId: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      price: string;
    };
  }>;
}

export default function Payment() {
  const [location, setLocation] = useLocation();
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderId, setOrderId] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');
  const [instrumentPreference, setInstrumentPreference] = useState<PhonePeInstrumentPreference>("UPI_INTENT");
  const [cashfreePaymentSessionId, setCashfreePaymentSessionId] = useState<string | null>(null);
  const [upiId, setUpiId] = useState<string>('');
  const { toast} = useToast();
  const { clearCart } = useCart();
  const checkoutLoaderRef = useRef<Promise<PhonePeCheckoutInstance> | null>(null);
  const latestPaymentIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const clearStatusPolling = () => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

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
          // Store cashfree session ID for use when user clicks Pay button
          if (orderInfo.cashfreePaymentSessionId) {
            setCashfreePaymentSessionId(orderInfo.cashfreePaymentSessionId);
            console.log('[Payment] Order data loaded with Cashfree session ID, waiting for user action');
          }
        }
      }
    }
  }, [location]);

  useEffect(() => {
    return () => {
      clearStatusPolling();
    };
  }, []);

  // Fetch order details from API if not in session storage
  const { data: order, isLoading: isLoadingOrder } = useQuery<OrderData>({
    queryKey: ["/api/orders", orderId],
    enabled: Boolean(orderId) && !orderData,
    retry: false
  });

  // Determine if we're using Cashfree or PhonePe
  const paymentMethod = orderData?.paymentMethod || order?.paymentMethod;
  const isCashfree = paymentMethod?.toLowerCase() === 'upi' || paymentMethod?.toLowerCase() === 'cashfree';

  const loadPhonePeCheckout = async () => {
    if (window.PhonePeCheckout) {
      return window.PhonePeCheckout;
    }

    if (checkoutLoaderRef.current) {
      return checkoutLoaderRef.current;
    }

    const scriptPromise = new Promise<PhonePeCheckoutInstance>((resolve, reject) => {
      const handleLoad = () => {
        if (window.PhonePeCheckout) {
          resolve(window.PhonePeCheckout);
        } else {
          reject(new Error('PhonePe checkout unavailable after load'));
        }
      };

      const handleError = () => {
        reject(new Error('Failed to load PhonePe checkout script'));
      };

      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PHONEPE_CHECKOUT_SRC}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', handleLoad, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = PHONEPE_CHECKOUT_SRC;
      script.async = true;
      script.onload = handleLoad;
      script.onerror = handleError;
      document.body.appendChild(script);
    }).catch((error) => {
      checkoutLoaderRef.current = null;
      throw error;
    });

    checkoutLoaderRef.current = scriptPromise;
    return scriptPromise;
  };

  // Create payment mutation
  const cancelPaymentMutation = useMutation({
    mutationFn: async (input: { paymentId: string; orderId: string; reason?: string }) => {
      await apiRequest("POST", "/api/payments/cancel", input);
    },
    onError: () => {
      toast({
        title: "Cancellation Failed",
        description: "We couldn't record the PhonePe cancellation. Please try again.",
        variant: "destructive"
      });
    },
  });

  const createCashfreePaymentMutation = useMutation({
    mutationFn: async () => {
      const currentOrderData = orderData || order;
      if (!currentOrderData) throw new Error('No order data available');

      // Generate unique idempotency key for this payment request
      const idempotencyKey = crypto.randomUUID();

      const response = await apiRequest("POST", "/api/payments/create", {
        orderId: orderId,
        amount: parseFloat(currentOrderData.total),
        currency: 'INR',
        customer: {
          name: currentOrderData.userInfo.name,
          email: currentOrderData.userInfo.email,
          phone: currentOrderData.userInfo.phone,
        },
        billing: {
          addressLine1: currentOrderData.deliveryAddress.split('\n')[0] || 'N/A',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'IN',
        },
        successUrl: `${window.location.origin}/payment-success?orderId=${orderId}`,
        failureUrl: `${window.location.origin}/payment-failed?orderId=${orderId}`,
        description: `Payment for order ${orderId}`,
        provider: 'cashfree',
      }, {
        'Idempotency-Key': idempotencyKey,
      });

      const payload = await response.json();
      return payload.data;
    },
    onSuccess: (data) => {
      if (!data || !data.providerData?.paymentSessionId) {
        toast({
          title: "Payment Error",
          description: "Unable to initiate payment. Please try again.",
          variant: "destructive"
        });
        setPaymentStatus('failed');
        return;
      }

      latestPaymentIdRef.current = data.paymentId ?? null;
      setCashfreePaymentSessionId(data.providerData.paymentSessionId);
      setPaymentStatus('pending');

      // Start polling for payment status (for QR code and app intent flows)
      if (data.paymentId) {
        setTimeout(() => {
          checkPaymentStatusMutation.mutate(data.paymentId);
        }, 5000);
      }
    },
    onError: (error) => {
      console.error('Cashfree payment creation failed:', error);
      toast({
        title: "Payment Failed",
        description: "Unable to process payment. Please try again.",
        variant: "destructive"
      });
      setPaymentStatus('failed');
    }
  });

  const initiateUPIPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!cashfreePaymentSessionId || !upiId) {
        throw new Error('Missing payment session ID or UPI ID');
      }

      const response = await apiRequest("POST", "/api/payments/initiate-upi", {
        orderId: orderId,
        paymentSessionId: cashfreePaymentSessionId,
        upiId: upiId.trim(),
      });

      const payload = await response.json();
      return payload.data;
    },
    onSuccess: (data) => {
      // Store the payment ID for status polling
      latestPaymentIdRef.current = data.paymentId;
      setPaymentStatus('processing');
      toast({
        title: "Payment Initiated",
        description: "Please check your UPI app to approve the payment request.",
      });

      // Start polling for payment status
      if (data.paymentId) {
        setTimeout(() => {
          checkPaymentStatusMutation.mutate(data.paymentId);
        }, 5000);
      }
    },
    onError: (error) => {
      console.error('UPI payment initiation failed:', error);
      toast({
        title: "Payment Failed",
        description: "Unable to initiate UPI payment. Please check your VPA and try again.",
        variant: "destructive"
      });
      setPaymentStatus('failed');
    }
  });

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const currentOrderData = orderData || order;
      if (!currentOrderData) throw new Error('No order data available');

      const response = await apiRequest("POST", "/api/payments/token-url", {
        orderId: orderId,
        amount: parseFloat(currentOrderData.total),
        currency: 'INR',
        customer: {
          name: currentOrderData.userInfo.name,
          email: currentOrderData.userInfo.email,
          phone: currentOrderData.userInfo.phone,
        },
        redirectUrl: `${window.location.origin}/payment/success?orderId=${orderId}`,
        callbackUrl: `${window.location.origin}/api/payments/webhook/phonepe`,
        mobileNumber: currentOrderData.userInfo.phone,
        instrumentPreference,
        payPageType: 'IFRAME',
      });

      const payload = await response.json();
      return payload.data as PhonePeTokenResponse;
    },
    onSuccess: async (data) => {
      if (!data || !data.tokenUrl) {
        toast({
          title: "Payment Error",
          description: "Unable to initiate payment. Please try again.",
          variant: "destructive"
        });
        setPaymentStatus('failed');
        return;
      }

      setPaymentStatus('processing');
      latestPaymentIdRef.current = data.paymentId ?? null;

      try {
        const checkout = await loadPhonePeCheckout();
        checkout.transact({
          tokenUrl: data.tokenUrl,
          type: 'IFRAME',
          callback: (event) => {
            const status = event?.status;

            if (status === 'USER_CANCEL') {
              const cancelledPaymentId = latestPaymentIdRef.current;
              if (cancelledPaymentId && orderId) {
                cancelPaymentMutation.mutate({
                  paymentId: cancelledPaymentId,
                  orderId,
                  reason: 'USER_CANCEL',
                });
              }
              latestPaymentIdRef.current = null;
              clearStatusPolling();
              setPaymentStatus('failed');
              toast({
                title: "Payment Cancelled",
                description: "You cancelled the PhonePe payment. Please try again if you wish to continue.",
              });
              return;
            }

            if (status === 'CONCLUDED') {
              const paymentId = latestPaymentIdRef.current;
              if (paymentId) {
                checkPaymentStatusMutation.mutate(paymentId);
              } else {
                console.warn('Unable to determine payment ID for status check');
              }
            }
          },
        });
      } catch (error) {
        console.error('Failed to initialize PhonePe checkout:', error);
        toast({
          title: "Payment Error",
          description: "Unable to load PhonePe checkout. Please try again.",
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
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest("GET", `/api/payments/status/${paymentId}`);
      return response.json();
    },
    onSuccess: (data, paymentId) => {
      const status = data?.data?.status as string | undefined;
      const errorInfo = data?.data?.error as { message?: string } | undefined;

      if (status === 'COMPLETED') {
        clearStatusPolling();
        latestPaymentIdRef.current = null;
        setPaymentStatus('completed');
        toast({
          title: "Payment Successful",
          description: "Your payment has been completed successfully!",
        });
        clearCart.mutate();
        const thankYouPath = orderId ? `/thank-you?orderId=${orderId}` : '/thank-you';
        setLocation(thankYouPath);
        return;
      }

      if (status === 'FAILED') {
        clearStatusPolling();
        latestPaymentIdRef.current = null;
        setPaymentStatus('failed');
        toast({
          title: "Payment Failed",
          description: errorInfo?.message || "Your payment could not be processed. Please try again.",
          variant: "destructive"
        });
        return;
      }

      if (status === 'PENDING' && paymentId) {
        setPaymentStatus('processing');
        clearStatusPolling();
        pollTimeoutRef.current = window.setTimeout(() => {
          checkPaymentStatusMutation.mutate(paymentId);
        }, 5000);
        return;
      }

      if (errorInfo?.message) {
        toast({
          title: "Payment Status",
          description: errorInfo.message,
        });
      }
    },
    onError: () => {
      clearStatusPolling();
      latestPaymentIdRef.current = null;
      setPaymentStatus('failed');
      toast({
        title: "Status Check Failed",
        description: "We couldn't verify the payment status. Please try again.",
        variant: "destructive"
      });
    }
  });

  const currentOrderData = orderData || order;
  const isLoading = isLoadingOrder || createPaymentMutation.isPending || createCashfreePaymentMutation.isPending;

  // Handle back to checkout
  const handleBackToCheckout = () => {
    setLocation("/checkout");
  };

  // Handle retry payment
  const handleRetryPayment = () => {
    setPaymentStatus('pending');
    latestPaymentIdRef.current = null;
    clearStatusPolling();
    if (isCashfree) {
      createCashfreePaymentMutation.mutate();
    } else {
      createPaymentMutation.mutate();
    }
  };

  // Handle payment initiation
  const handleInitiatePayment = () => {
    if (currentOrderData) {
      if (isCashfree) {
        // For Cashfree, we already have payment session ID and pending payment from page load
        // Payment record already exists and polling is active - don't clear them
        setPaymentStatus('pending');
      } else {
        latestPaymentIdRef.current = null;
        clearStatusPolling();
        createPaymentMutation.mutate();
      }
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
    <div className="max-w-7xl mx-auto px-4">
      <div className="space-y-3 sm:space-y-6">
        {/* Back Button and Title */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
        <Button 
          onClick={handleBackToCheckout}
          variant="ghost" 
          className="-ml-2 hover:bg-gray-100"
          data-testid="button-back-to-checkout"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Complete Payment</h1>
          <p className="text-gray-600">
            Secure payment powered by {isCashfree ? 'Cashfree' : 'PhonePe'}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2">
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
                      {isCashfree 
                        ? (cashfreePaymentSessionId 
                            ? 'Enter your UPI ID to complete the payment.' 
                            : 'Click below to set up your payment.')
                        : 'The PhonePe checkout will open in a secure iframe to complete your payment.'
                      }
                    </p>
                  </div>
                  {!isCashfree && (
                    <div className="space-y-3 mb-6">
                      <p className="text-sm font-medium text-gray-900">Choose how you want to pay with UPI</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {PHONEPE_INSTRUMENT_OPTIONS.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={instrumentPreference === option.value ? "default" : "outline"}
                            className="h-auto w-full flex-col items-start justify-start gap-1 py-3"
                            onClick={() => setInstrumentPreference(option.value)}
                            data-testid={option.testId}
                            aria-pressed={instrumentPreference === option.value}
                          >
                            <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                            <span className="text-xs text-gray-500 text-left">
                              {option.description}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {isCashfree && cashfreePaymentSessionId && (
                    <div className="space-y-4 mb-6">
                      <div className="space-y-2">
                        <label htmlFor="upi-id" className="text-sm font-medium text-gray-900">
                          UPI ID / VPA
                        </label>
                        <Input
                          id="upi-id"
                          type="text"
                          placeholder="yourname@upi (e.g., success@upi)"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          disabled={initiateUPIPaymentMutation.isPending}
                          data-testid="input-upi-id"
                          className="w-full"
                        />
                        <p className="text-xs text-gray-500">
                          Use success@upi for testing
                        </p>
                      </div>
                      <Button
                        onClick={() => initiateUPIPaymentMutation.mutate()}
                        disabled={!upiId.trim() || initiateUPIPaymentMutation.isPending}
                        size="lg"
                        className="w-full"
                        data-testid="button-pay-with-upi"
                      >
                        {initiateUPIPaymentMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Initiating Payment...
                          </>
                        ) : (
                          <>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Pay ₹{parseFloat(currentOrderData.total).toFixed(2)}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {!(isCashfree && cashfreePaymentSessionId) && (
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
                          {isCashfree ? 'Set Up Payment' : `Pay ₹${parseFloat(currentOrderData.total).toFixed(2)} with PhonePe`}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {paymentStatus === 'processing' && (
                <div className="text-center py-6">
                  <div className="mb-4">
                    <Loader2 className="h-16 w-16 text-blue-600 animate-spin mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Payment</h3>
                    <p className="text-gray-600">
                      {isCashfree 
                        ? 'Please complete the payment on the Cashfree payment page.'
                        : 'Please complete the payment in the PhonePe app or website.'
                      }
                    </p>
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
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Summary - Right Side */}
        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Order ID:</span>
                  <span className="font-mono text-xs font-medium break-all" data-testid="text-order-id">
                    {orderId}
                  </span>
                </div>
              </div>

              {/* Itemized List */}
              {currentOrderData.items && currentOrderData.items.length > 0 && (
                <>
                  <div className="space-y-2 mb-3 text-sm">
                    {currentOrderData.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-gray-600">
                        <span className="flex-1">
                          {item.product.name} × {item.quantity}
                        </span>
                        <span className="ml-2">₹{(parseFloat(item.product.price) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <hr className="my-3" />
                </>
              )}

              {/* Summary Totals */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span data-testid="text-subtotal">₹{(parseFloat(currentOrderData.subtotal) / 1.05).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax (5%)</span>
                  <span data-testid="text-tax">₹{(parseFloat(currentOrderData.subtotal) - (parseFloat(currentOrderData.subtotal) / 1.05)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span data-testid="text-shipping">₹50.00</span>
                </div>
                {parseFloat(currentOrderData.discountAmount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span data-testid="text-discount">-₹{parseFloat(currentOrderData.discountAmount).toFixed(2)}</span>
                  </div>
                )}
                <hr className="my-2" />
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span data-testid="text-total">₹{parseFloat(currentOrderData.total).toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </div>
  );
}