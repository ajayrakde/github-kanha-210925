import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, CreditCard, ArrowLeft, AlertCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import useUpiPaymentState, {
  type PhonePeTokenUrlData,
  type UpiWidgetStatus,
} from "@/hooks/use-upi-payment-state";
import UpiPaymentWidget, {
  type MerchantMetadataItem,
  type UpiPaymentMode,
  type UpiPaymentStatus,
} from "@/components/payment/UpiPaymentWidget";

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

type PhonePeTokenResponse = Partial<PhonePeTokenUrlData>;

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const formatIndianCurrency = (value?: string | number | null) => {
  if (typeof value === "number") {
    return CURRENCY_FORMATTER.format(Number.isFinite(value) ? value : 0);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return CURRENCY_FORMATTER.format(parsed);
    }
  }

  return CURRENCY_FORMATTER.format(0);
};

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
  const [isActionLocked, setIsActionLocked] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const { toast} = useToast();
  const { clearCart } = useCart();
  const checkoutLoaderRef = useRef<Promise<PhonePeCheckoutInstance> | null>(null);
  const latestPaymentIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const widgetAwaitingSkipRef = useRef(false);
  const progressIntervalRef = useRef<number | null>(null);
  
  const clearStatusPolling = () => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  const clearProgressAnimation = () => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

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

  // Clear action lock when payment completes or fails
  useEffect(() => {
    if (paymentStatus === 'completed' || paymentStatus === 'failed') {
      setIsActionLocked(false);
    }
  }, [paymentStatus]);

  // Animate progress bar when payment is processing
  useEffect(() => {
    if (paymentStatus === 'processing') {
      // Reset progress to 0
      setProcessingProgress(0);
      
      // Animate progress from 0 to 85% over time
      const startTime = Date.now();
      const duration = 30000; // 30 seconds to reach 85%
      const targetProgress = 85;
      
      const interval = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / duration) * targetProgress, targetProgress);
        setProcessingProgress(progress);
        
        // Stop at 85% and wait for actual completion
        if (progress >= targetProgress) {
          clearProgressAnimation();
        }
      }, 100);
      
      progressIntervalRef.current = interval;
      
      return () => {
        clearProgressAnimation();
      };
    } else if (paymentStatus === 'completed') {
      // Jump to 100% when completed
      clearProgressAnimation();
      setProcessingProgress(100);
    } else {
      // Reset progress for other states
      clearProgressAnimation();
      setProcessingProgress(0);
    }
  }, [paymentStatus]);

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

      // DO NOT clear cart here - only clear when payment is completed
      // Cart will be cleared in checkPaymentStatusMutation.onSuccess when status is COMPLETED

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
  }, []);

  // Fetch order details from API if not in session storage (backwards compatibility)
  const { data: order, isLoading: isLoadingOrder } = useQuery<OrderData>({
    queryKey: ["/api/orders", orderId],
    enabled: Boolean(orderId) && !orderData && !intentId,
    retry: false
  });

  const currentOrderData = orderData || order;
  // Determine if we're using Cashfree or PhonePe
  const paymentMethod = orderData?.paymentMethod || order?.paymentMethod;
  const isCashfree = paymentMethod?.toLowerCase() === 'upi' || paymentMethod?.toLowerCase() === 'cashfree';
  const merchantMetadata = useMemo(() => ({
    name: "Kanha Retail",
    vpa: "kanharetail@upi",
    code: "0000",
    transactionNote: currentOrderData?.orderId ? `Order ${currentOrderData.orderId}` : undefined,
  }), [currentOrderData?.orderId]);

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
        setWidgetStatusWithSkip('failed');
        return;
      }

      latestPaymentIdRef.current = data.paymentId ?? null;
      setCashfreePaymentSessionId(data.providerData.paymentSessionId);
      setPaymentStatus('pending');
      setWidgetStatusWithSkip('awaiting', { skipPollingClear: true });

      // Start polling for payment status (for QR code and app intent flows)
      if (data.paymentId) {
        scheduleStatusPolling(data.paymentId);
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
      setWidgetStatusWithSkip('failed');
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
      setWidgetStatusWithSkip('awaiting', { skipPollingClear: true });
      toast({
        title: "Payment Initiated",
        description: "Please check your UPI app to approve the payment request.",
      });

      // Start polling for payment status
      if (data.paymentId) {
        scheduleStatusPolling(data.paymentId);
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
      setWidgetStatusWithSkip('failed');
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
        setWidgetStatusWithSkip('failed');
        return;
      }

      setPaymentStatus('processing');
      applyGatewayStatus('PENDING');
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
              applyGatewayStatus('FAILED', 'USER_CANCEL');
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
      setWidgetStatusWithSkip('failed');
    }
  });

  const {
    widgetStatus,
    setWidgetStatus,
    applyGatewayStatus,
    upiUrl,
    upiQrDataUrl,
    isQrPlaceholder,
    copyUpiUrl,
    copyCheckoutUrl,
    shareableCheckoutUrl,
    merchantTransactionId,
  } = useUpiPaymentState({
    amount: currentOrderData?.total ?? 0,
    currency: 'INR',
    merchant: merchantMetadata,
    phonePeMutation: createPaymentMutation,
    cashfreeMutation: createCashfreePaymentMutation,
  });

  const setWidgetStatusWithSkip = useCallback(
    (status: UpiWidgetStatus, options?: { skipPollingClear?: boolean }) => {
      if (status === 'awaiting' && options?.skipPollingClear) {
        widgetAwaitingSkipRef.current = true;
      }

      setWidgetStatus(status);
    },
    [setWidgetStatus],
  );

  useEffect(() => {
    if (widgetStatus === 'awaiting') {
      if (widgetAwaitingSkipRef.current) {
        widgetAwaitingSkipRef.current = false;
        return;
      }

      clearStatusPolling();
    }
  }, [widgetStatus]);

  // Payment status checking mutation
  const checkPaymentStatusMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest("GET", `/api/payments/status/${paymentId}`);
      return response.json();
    },
    onSuccess: (data, paymentId) => {
      const status = data?.data?.status as string | undefined;
      const errorInfo = data?.data?.error as { message?: string; code?: string } | undefined;

      if (status === 'COMPLETED') {
        clearStatusPolling();
        latestPaymentIdRef.current = null;
        setPaymentStatus('completed');
        applyGatewayStatus('COMPLETED', errorInfo?.code ?? null);
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
        applyGatewayStatus('FAILED', errorInfo?.code ?? null);
        toast({
          title: "Payment Failed",
          description: errorInfo?.message || "Your payment could not be processed. Please try again.",
          variant: "destructive"
        });
        return;
      }

      if (status === 'PENDING' && paymentId) {
        setPaymentStatus('processing');
        applyGatewayStatus('PENDING');
        scheduleStatusPolling(paymentId);
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
      setWidgetStatusWithSkip('failed');
      toast({
        title: "Status Check Failed",
        description: "We couldn't verify the payment status. Please try again.",
        variant: "destructive"
      });
    }
  });

  const scheduleStatusPolling = useCallback(
    (paymentId: string, delay = 5000) => {
      clearStatusPolling();
      pollTimeoutRef.current = window.setTimeout(() => {
        checkPaymentStatusMutation.mutate(paymentId);
      }, delay);
    },
    [checkPaymentStatusMutation],
  );

  const isLoading = isCreatingOrder || isLoadingOrder || createPaymentMutation.isPending || createCashfreePaymentMutation.isPending;

  // Handle back to checkout
  const handleBackToCheckout = () => {
    setLocation("/checkout");
  };

  // Handle retry payment
  const handleRetryPayment = () => {
    if (isActionLocked) return;
    setPaymentStatus('pending');
    setWidgetStatusWithSkip('awaiting');
    latestPaymentIdRef.current = null;
    clearStatusPolling();
    if (isCashfree) {
      // For Cashfree, don't set lock as user still needs to choose payment method after retry
      createCashfreePaymentMutation.mutate();
    } else {
      // For PhonePe, set lock as we're calling the mutation
      setIsActionLocked(true);
      createPaymentMutation.mutate();
    }
  };

  // Handle payment initiation
  const handleInitiatePayment = () => {
    if (isActionLocked) return;
    if (currentOrderData) {
      if (isCashfree) {
        // For Cashfree, we already have payment session ID and pending payment from page load
        // Payment record already exists and polling is active - don't clear them
        // Don't set action lock here as user still needs to choose payment method (Collect/QR)
        setPaymentStatus('pending');
        setWidgetStatusWithSkip('awaiting', { skipPollingClear: true });
      } else {
        // For PhonePe, set lock as we're about to call a mutation
        setIsActionLocked(true);
        latestPaymentIdRef.current = null;
        clearStatusPolling();
        setWidgetStatusWithSkip('awaiting');
        createPaymentMutation.mutate();
      }
    }
  };

  const handleCopyUpiLink = async () => {
    const copied = await copyUpiUrl();
    toast({
      title: copied ? "UPI link copied" : "Copy unavailable",
      description: copied
        ? "Paste the link into your preferred UPI app if scanning is not possible."
        : "Copy access was blocked by your browser. Please copy the highlighted link manually.",
      variant: copied ? undefined : "destructive",
    });
  };

  const handleCopyCheckoutLink = async () => {
    if (!shareableCheckoutUrl) {
      toast({
        title: "Checkout link unavailable",
        description: "Launch the payment again to refresh the gateway link.",
        variant: "destructive",
      });
      return;
    }

    const copied = await copyCheckoutUrl();
    toast({
      title: copied ? "Checkout link copied" : "Copy unavailable",
      description: copied
        ? "Send the secure checkout URL to another device if needed."
        : "Copy access was blocked by your browser. Please copy the link manually.",
      variant: copied ? undefined : "destructive",
    });
  };

  const copyPlainText = useCallback(async (value?: string | null): Promise<boolean> => {
    if (!value) {
      return false;
    }

    const clipboard = globalThis?.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      return false;
    }

    try {
      await clipboard.writeText(value);
      return true;
    } catch (error) {
      console.warn('Clipboard write failed', error);
      return false;
    }
  }, []);

  const handleCopyMerchantVpa = useCallback(() => {
    void copyPlainText(merchantMetadata.vpa);
  }, [copyPlainText, merchantMetadata.vpa]);

  const handleCopyTransactionReference = useCallback(() => {
    const reference = merchantTransactionId ?? currentOrderData?.orderId ?? null;
    void copyPlainText(reference);
  }, [copyPlainText, merchantTransactionId, currentOrderData?.orderId]);

  const formattedAmount = useMemo(() => formatIndianCurrency(currentOrderData?.total ?? null), [currentOrderData?.total]);

  const widgetMerchant = useMemo(
    () => ({
      name: merchantMetadata?.name ?? 'Kanha Retail',
      vpa: merchantMetadata?.vpa ?? 'kanharetail@upi',
      amount: formattedAmount,
      orderLabel: currentOrderData?.orderId ? `Order ${currentOrderData.orderId}` : undefined,
    }),
    [merchantMetadata?.name, merchantMetadata?.vpa, formattedAmount, currentOrderData?.orderId],
  );

  const transactionReference = useMemo(
    () => merchantTransactionId ?? currentOrderData?.orderId ?? 'Pending',
    [merchantTransactionId, currentOrderData?.orderId],
  );

  const widgetMetadataItems = useMemo<MerchantMetadataItem[]>(() => {
    const items: MerchantMetadataItem[] = [];

    if (merchantMetadata?.code) {
      items.push({ label: 'Merchant code', value: merchantMetadata.code });
    }

    if (merchantMetadata?.transactionNote) {
      items.push({ label: 'Payment note', value: merchantMetadata.transactionNote });
    }

    if (shareableCheckoutUrl) {
      items.push({
        label: 'Checkout URL',
        value: shareableCheckoutUrl,
        onCopy: handleCopyCheckoutLink,
        copyAriaLabel: 'Copy checkout URL',
      });
    }

    return items;
  }, [merchantMetadata?.code, merchantMetadata?.transactionNote, shareableCheckoutUrl, handleCopyCheckoutLink]);

  const widgetHelperNotes = useMemo(
    () => [
      {
        id: 'upi-app-flow',
        text: 'Approve the request in your UPI app and return to this tab so we can confirm the payment.',
      },
      {
        id: 'upi-copy-fallback',
        text: 'Copy the deep link or QR code link if your browser blocks automatic launches.',
      },
      ...(isCashfree
        ? [
            {
              id: 'upi-collect',
              text: 'Collect requests may take a few seconds to appear. Check your UPI app notifications if you do not see it immediately.',
            },
          ]
        : []),
    ],
    [isCashfree],
  );

  const widgetNote = useMemo(
    () =>
      isCashfree
        ? 'Enter your UPI ID below if you prefer a collect request instead of scanning the QR code.'
        : 'Launch your preferred UPI app or scan the QR code to finish the payment securely.',
    [isCashfree],
  );

  const derivedWidgetStatus = useMemo<UpiPaymentStatus>(() => {
    if (widgetStatus === 'success' || paymentStatus === 'completed') {
      return 'success';
    }

    if (widgetStatus === 'failed' || paymentStatus === 'failed') {
      return 'failure';
    }

    if (widgetStatus === 'expired') {
      return 'expired';
    }

    if (
      createPaymentMutation.isPending
      || createCashfreePaymentMutation.isPending
      || initiateUPIPaymentMutation.isPending
    ) {
      return 'initiated';
    }

    if (checkPaymentStatusMutation.isPending || paymentStatus === 'processing') {
      return 'processing';
    }

    if (widgetStatus === 'awaiting') {
      return paymentStatus === 'pending' ? 'idle' : 'pending';
    }

    return 'idle';
  }, [
    widgetStatus,
    paymentStatus,
    createPaymentMutation.isPending,
    createCashfreePaymentMutation.isPending,
    initiateUPIPaymentMutation.isPending,
    checkPaymentStatusMutation.isPending,
  ]);

  let widgetCtaLabel = '';
  let widgetCtaDisabled = false;

  switch (paymentStatus) {
    case 'pending':
      widgetCtaLabel = isCashfree
        ? `Pay ${formattedAmount} with UPI`
        : `Pay ${formattedAmount} with UPI`;
      widgetCtaDisabled = isLoading;
      break;
    case 'processing':
      widgetCtaLabel = 'Refresh payment status';
      widgetCtaDisabled = checkPaymentStatusMutation.isPending;
      break;
    case 'failed':
      widgetCtaLabel = 'Retry payment';
      widgetCtaDisabled = isLoading;
      break;
    case 'completed':
      widgetCtaLabel = 'Payment completed';
      widgetCtaDisabled = true;
      break;
    default:
      widgetCtaLabel = 'Continue';
      widgetCtaDisabled = false;
      break;
  }

  const handleWidgetModeChange = useCallback(
    (mode: UpiPaymentMode) => {
      setInstrumentPreference(mode === 'qr' ? 'UPI_QR' : 'UPI_INTENT');
    },
    [setInstrumentPreference],
  );

  const handleWidgetCollectTriggered = useCallback(() => {
    setInstrumentPreference('UPI_COLLECT');
    setWidgetStatusWithSkip('awaiting', { skipPollingClear: true });
  }, [setInstrumentPreference, setWidgetStatusWithSkip]);

  const handleWidgetIntentLaunch = useCallback(() => {
      if (isActionLocked) {
        return;
      }

      if (!upiUrl) {
        toast({
          title: "UPI link unavailable",
          description: "Start a payment attempt to generate the deep link.",
          variant: "destructive",
        });
        return;
      }

      setIsActionLocked(true);
      setInstrumentPreference('UPI_INTENT');
      setWidgetStatusWithSkip('awaiting', { skipPollingClear: true });

      try {
        window.location.href = upiUrl;
      } catch (error) {
        console.warn('Failed to launch UPI intent', error);
        window.open(upiUrl, '_self');
      }

      // Clear lock after 3 seconds to allow user to retry if they back out of the UPI app
      setTimeout(() => {
        setIsActionLocked(false);
      }, 3000);

      const paymentId = latestPaymentIdRef.current;
      if (paymentId) {
        scheduleStatusPolling(paymentId);
      }
    }, [isActionLocked, upiUrl, toast, setInstrumentPreference, setWidgetStatusWithSkip, scheduleStatusPolling]);

  const handleWidgetCta = useCallback(
    (mode: UpiPaymentMode) => {
      if (paymentStatus === 'pending') {
        if (isCashfree) {
          setInstrumentPreference('UPI_COLLECT');
        } else {
          setInstrumentPreference(mode === 'qr' ? 'UPI_QR' : 'UPI_INTENT');
        }
        handleInitiatePayment();
        return;
      }

      if (paymentStatus === 'failed') {
        handleRetryPayment();
        return;
      }

      if (paymentStatus === 'processing') {
        const paymentId = latestPaymentIdRef.current;
        if (paymentId) {
          scheduleStatusPolling(paymentId, 0);
        } else {
          toast({
            title: "No active payment",
            description: "Start a payment attempt before refreshing the status.",
          });
        }
      }
    },
    [
      paymentStatus,
      isCashfree,
      setInstrumentPreference,
      handleInitiatePayment,
      handleRetryPayment,
      scheduleStatusPolling,
      toast,
    ],
  );

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
            <CardContent className="space-y-6">
              <span className="sr-only" data-testid="text-upi-widget-status">{widgetStatus}</span>
              <UpiPaymentWidget
                status={derivedWidgetStatus}
                upiUrl={upiUrl ?? ''}
                qrDataUrl={isQrPlaceholder ? undefined : upiQrDataUrl ?? undefined}
                merchant={widgetMerchant}
                metadata={widgetMetadataItems}
                transactionReference={transactionReference}
                note={widgetNote}
                helperNotes={widgetHelperNotes}
                onCopyUpiUrl={handleCopyUpiLink}
                onCopyTransactionReference={handleCopyTransactionReference}
                onCopyVpa={handleCopyMerchantVpa}
                onModeChange={handleWidgetModeChange}
                onIntentAppSelect={handleWidgetIntentLaunch}
                onCtaClick={handleWidgetCta}
                ctaLabel={widgetCtaLabel}
                ctaDisabled={widgetCtaDisabled}
                ctaTestId="button-initiate-payment"
                onCollectTriggered={handleWidgetCollectTriggered}
                disabled={
                  isActionLocked ||
                  createPaymentMutation.isPending || 
                  createCashfreePaymentMutation.isPending || 
                  paymentStatus === 'processing'
                }
              />

              {isCashfree && cashfreePaymentSessionId ? (
                <div className="space-y-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
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
                      disabled={
                        isActionLocked ||
                        initiateUPIPaymentMutation.isPending || 
                        createPaymentMutation.isPending || 
                        createCashfreePaymentMutation.isPending || 
                        paymentStatus === 'processing'
                      }
                      data-testid="input-upi-id"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">Use success@upi for testing</p>
                  </div>
                  <Button
                    onClick={() => {
                      if (isActionLocked) return;
                      setIsActionLocked(true);
                      handleWidgetCollectTriggered();
                      initiateUPIPaymentMutation.mutate();
                    }}
                    disabled={
                      isActionLocked ||
                      !upiId.trim() || 
                      initiateUPIPaymentMutation.isPending || 
                      createPaymentMutation.isPending || 
                      createCashfreePaymentMutation.isPending || 
                      paymentStatus === 'processing'
                    }
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
                        Pay {formattedAmount}
                      </>
                    )}
                  </Button>
                </div>
              ) : null}

              {paymentStatus === 'processing' ? (
                <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50 p-5" data-testid="processing-indicator">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-900">Processing Payment</p>
                      <p className="text-sm text-blue-700">Waiting for confirmation from your UPI provider...</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress 
                      value={processingProgress} 
                      className="h-2 bg-blue-100"
                      data-testid="payment-progress-bar"
                    />
                    <p className="text-xs text-blue-600 text-right">{Math.round(processingProgress)}%</p>
                  </div>
                </div>
              ) : null}

              {paymentStatus === 'completed' ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CreditCard className="h-4 w-4" />
                  <span>Payment successful! Redirecting you to the thank-you page.</span>
                </div>
              ) : null}

              {paymentStatus === 'failed' ? (
                <div className="space-y-3 rounded-lg border border-red-100 bg-red-50 p-4">
                  <div className="flex items-center gap-3 text-sm text-red-900">
                    <AlertCircle className="h-4 w-4" />
                    <span>Your payment could not be processed. Please try again.</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={handleRetryPayment}
                      disabled={isLoading}
                      size="lg"
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
                      data-testid="button-back-to-checkout-failed"
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : null}
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