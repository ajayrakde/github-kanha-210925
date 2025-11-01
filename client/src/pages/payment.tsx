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
import UpiPaymentWidget, {
  type PhonePeInstrumentPreference,
  type UpiPaymentDetails,
} from "@/components/payment/upi-payment-widget";
import useUpiPaymentState from "@/hooks/use-upi-payment-state";

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
  const [intentId, setIntentId] = useState<string>("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const { toast} = useToast();
  const { clearCart } = useCart();
  const upiWidgetState = useUpiPaymentState();
  const [phonePeUpiDetails, setPhonePeUpiDetails] = useState<UpiPaymentDetails | null>(null);
  const checkoutLoaderRef = useRef<Promise<PhonePeCheckoutInstance> | null>(null);
  const latestPaymentIdRef = useRef<string | null>(null);
  const clearStatusPolling = upiWidgetState.clearPoll;

  // Extract intentId or orderId from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const intentIdParam = urlParams.get('intentId');
    const orderIdParam = urlParams.get('orderId');

    // New flow: intentId from checkout
    if (intentIdParam) {
      setIntentId(intentIdParam);
      console.log('[Payment] Intent ID received:', intentIdParam);
    }
    // Old flow: orderId (backwards compatibility)
    else if (orderIdParam) {
      setOrderId(orderIdParam);
      
      // Get order data from session storage (old flow)
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

  // Create order from checkout intent with retry logic
  const startPaymentMutation = useMutation({
    mutationFn: async (checkoutIntentId: string) => {
      setIsCreatingOrder(true);
      
      console.log('[Payment] Starting payment with intent:', checkoutIntentId);

      // Retry logic with exponential backoff
      let lastError: Error | null = null;
      const maxRetries = 3;
      const baseDelay = 1000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Backend will fetch the intent from database using the intentId
          const response = await apiRequest("POST", "/api/payments/start", {
            checkoutIntentId: checkoutIntentId,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Payment initiation failed');
          }

          const result = await response.json();
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.log(`[Payment] Attempt ${attempt + 1} failed:`, lastError.message);

          // Don't retry on client errors (400-499)
          if (error instanceof Error && error.message.includes('Intent ID mismatch')) {
            throw error;
          }

          // Retry with exponential backoff
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[Payment] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError || new Error('Payment initiation failed after retries');
    },
    onSuccess: (result) => {
      console.log('[Payment] Order created:', result.order.id);
      
      // Set order data
      setOrderId(result.order.id);
      setOrderData({
        orderId: result.order.id,
        total: result.order.total,
        subtotal: result.order.subtotal,
        discountAmount: result.order.discountAmount,
        paymentMethod: result.order.paymentMethod,
        deliveryAddress: result.order.deliveryAddress,
        userInfo: result.order.userInfo,
        cashfreePaymentSessionId: result.order.cashfreePaymentSessionId,
        items: result.order.items, // Use items from backend response
      });

      // Set Cashfree payment session ID if available
      if (result.order.cashfreePaymentSessionId) {
        setCashfreePaymentSessionId(result.order.cashfreePaymentSessionId);
        console.log('[Payment] Cashfree session ID set:', result.order.cashfreePaymentSessionId);
      }

      // Clear the cart on the frontend
      clearCart.mutate();
      console.log('[Payment] Cart cleared');

      // Clear checkout intent from storage
      sessionStorage.removeItem('checkoutIntent');
      setIsCreatingOrder(false);
    },
    onError: (error) => {
      console.error('[Payment] Failed to create order:', error);
      setIsCreatingOrder(false);
      
      const errorMessage = error instanceof Error ? error.message : "Failed to initiate payment. Please try again.";
      
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Redirect back to checkout after a delay
      setTimeout(() => {
        setLocation('/checkout');
      }, 3000);
    },
  });

  // Automatically create order when intentId is available
  useEffect(() => {
    if (intentId && !orderId && !isCreatingOrder) {
      startPaymentMutation.mutate(intentId);
    }
  }, [intentId, orderId, isCreatingOrder]);

  useEffect(() => {
    return () => {
      clearStatusPolling();
    };
  }, [clearStatusPolling]);

  // Fetch order details from API if not in session storage (backwards compatibility)
  const { data: order, isLoading: isLoadingOrder } = useQuery<OrderData>({
    queryKey: ["/api/orders", orderId],
    enabled: Boolean(orderId) && !orderData && !intentId,
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
        upiWidgetState.setFailed();
        return;
      }

      latestPaymentIdRef.current = data.paymentId ?? null;
      setCashfreePaymentSessionId(data.providerData.paymentSessionId);
      setPaymentStatus('pending');
      upiWidgetState.reset();

      const paymentId = data.paymentId;
      if (paymentId) {
        upiWidgetState.schedulePoll(() => {
          checkPaymentStatusMutation.mutate(paymentId);
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
      upiWidgetState.setFailed();
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
      upiWidgetState.onCollectTriggered();
      toast({
        title: "Payment Initiated",
        description: "Please check your UPI app to approve the payment request.",
      });

      // Start polling for payment status
      const paymentId = data.paymentId;
      if (paymentId) {
        upiWidgetState.schedulePoll(() => {
          checkPaymentStatusMutation.mutate(paymentId);
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
      upiWidgetState.setFailed();
    }
  });

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const currentOrderData = orderData || order;
      if (!currentOrderData) throw new Error('No order data available');

      setPhonePeUpiDetails(null);
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
        upiWidgetState.setFailed();
        return;
      }

      latestPaymentIdRef.current = data.paymentId ?? null;

      const upiDetails = (data as PhonePeTokenResponse & { upi?: UpiPaymentDetails }).upi ?? null;
      setPhonePeUpiDetails(upiDetails);

      const hasIntentUrl = Boolean(upiDetails?.url || upiDetails?.rawUrl);
      const hasQrData = Boolean(upiDetails?.qrData);

      if (instrumentPreference === 'UPI_INTENT' && hasIntentUrl) {
        setPaymentStatus('pending');
        upiWidgetState.reset();
        return;
      }

      if (instrumentPreference === 'UPI_QR' && hasQrData) {
        setPaymentStatus('processing');
        upiWidgetState.setAwaiting();
        const paymentId = data.paymentId;
        if (paymentId) {
          upiWidgetState.schedulePoll(() => {
            checkPaymentStatusMutation.mutate(paymentId);
          }, 5000);
        }
        return;
      }

      setPaymentStatus('processing');
      upiWidgetState.setProcessing();

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
              upiWidgetState.setFailed();
              toast({
                title: "Payment Cancelled",
                description: "You cancelled the PhonePe payment. Please try again if you wish to continue.",
              });
              return;
            }

            if (status === 'CONCLUDED') {
              const paymentId = latestPaymentIdRef.current;
              if (paymentId) {
                upiWidgetState.setAwaiting();
                checkPaymentStatusMutation.mutate(paymentId);
              } else {
                console.warn('Unable to determine payment ID for status check');
              }
            }
          },
        });
        upiWidgetState.setAwaiting();
      } catch (error) {
        console.error('Failed to initialize PhonePe checkout:', error);
        toast({
          title: "Payment Error",
          description: "Unable to load PhonePe checkout. Please try again.",
          variant: "destructive"
        });
        setPaymentStatus('failed');
        upiWidgetState.setFailed();
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
      upiWidgetState.setFailed();
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
        upiWidgetState.setSuccess();
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
        upiWidgetState.setFailed();
        toast({
          title: "Payment Failed",
          description: errorInfo?.message || "Your payment could not be processed. Please try again.",
          variant: "destructive"
        });
        return;
      }

      if (status === 'PENDING' && paymentId) {
        setPaymentStatus('processing');
        upiWidgetState.setProcessing();
        clearStatusPolling();
        upiWidgetState.schedulePoll(() => {
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
      upiWidgetState.setFailed();
      toast({
        title: "Status Check Failed",
        description: "We couldn't verify the payment status. Please try again.",
        variant: "destructive"
      });
    }
  });

  const currentOrderData = orderData || order;
  const isLoading = isCreatingOrder || isLoadingOrder || createPaymentMutation.isPending || createCashfreePaymentMutation.isPending;

  const handleInstrumentPreferenceChange = (value: PhonePeInstrumentPreference) => {
    setInstrumentPreference(value);
    if (value !== instrumentPreference) {
      setPhonePeUpiDetails(null);
      upiWidgetState.reset();
    }
  };

  const handleLaunchUpiIntent = () => {
    const intentUrl = phonePeUpiDetails?.url ?? phonePeUpiDetails?.rawUrl;
    if (!intentUrl) {
      toast({
        title: "UPI link unavailable",
        description: "We couldn't open your UPI app. Please retry the payment.",
        variant: "destructive",
      });
      return;
    }

    upiWidgetState.setAwaiting();
    setPaymentStatus('processing');

    const paymentId = latestPaymentIdRef.current;
    if (paymentId) {
      upiWidgetState.schedulePoll(() => {
        checkPaymentStatusMutation.mutate(paymentId);
      }, 5000);
    }

    try {
      window.location.href = intentUrl;
    } catch (error) {
      console.warn('Falling back to window.open for UPI intent launch', error);
      window.open(intentUrl, '_self');
    }
  };

  // Handle back to checkout
  const handleBackToCheckout = () => {
    setLocation("/checkout");
  };

  // Handle retry payment
  const handleRetryPayment = () => {
    setPaymentStatus('pending');
    latestPaymentIdRef.current = null;
    setPhonePeUpiDetails(null);
    upiWidgetState.reset();
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
        upiWidgetState.reset();
      } else {
        latestPaymentIdRef.current = null;
        setPhonePeUpiDetails(null);
        clearStatusPolling();
        setPaymentStatus('processing');
        upiWidgetState.setProcessing();
        createPaymentMutation.mutate();
      }
    }
  };

  // Show loading state if we have an intentId but haven't created the order yet
  if (!orderId && (intentId || isCreatingOrder)) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Preparing your order and payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show error if we have no orderId AND no intentId AND not creating order
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
            <p className="text-gray-600">
              {isCreatingOrder ? "Preparing your order and payment..." : "Loading order details..."}
            </p>
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
        <div className="flex sm:flex-row items-center sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
        <Button
          onClick={handleBackToCheckout}
          variant="ghost"
          className="-ml-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          data-testid="button-back-to-checkout"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Complete Payment</h1>
          <p className="text-gray-600 hidden sm:block">
            Secure payment powered by UPI
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
              <UpiPaymentWidget
                state={upiWidgetState}
                paymentStatus={paymentStatus}
                instrumentPreference={instrumentPreference}
                onInstrumentPreferenceChange={handleInstrumentPreferenceChange}
                onInitiatePhonePe={handleInitiatePayment}
                isInitiatingPhonePe={createPaymentMutation.isPending}
                isLoading={isLoading}
                upiDetails={phonePeUpiDetails}
                onLaunchIntent={
                  instrumentPreference === 'UPI_INTENT'
                  && Boolean(phonePeUpiDetails?.url || phonePeUpiDetails?.rawUrl)
                    ? handleLaunchUpiIntent
                    : undefined
                }
                onRetry={handleRetryPayment}
                onBack={handleBackToCheckout}
                isCashfree={Boolean(isCashfree)}
                hasCashfreeCollectForm={Boolean(isCashfree && cashfreePaymentSessionId)}
                amountDisplay={currentOrderData.total}
                fallbackCurrency="INR"
              />

              {isCashfree && cashfreePaymentSessionId && paymentStatus === 'pending' && (
                <div className="mt-6 space-y-4">
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
                    onClick={() => {
                      upiWidgetState.onCollectTriggered();
                      initiateUPIPaymentMutation.mutate();
                    }}
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
                    #{orderId.slice(0, 8).toUpperCase()}
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
