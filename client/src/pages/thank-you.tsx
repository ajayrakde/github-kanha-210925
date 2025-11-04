import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { scrollToContext } from "@/lib/scroll-utils";

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

interface PaymentTransactionInfo {
  id: string;
  status: string;
  amount: string;
  amountMinor?: number;
  merchantTransactionId: string;
  providerPaymentId?: string;
  providerTransactionId?: string;
  providerReferenceId?: string;
  upiPayerHandle?: string;
  upiUtr?: string;
  upiInstrumentVariant?: string;
  upiInstrumentLabel?: string;
  receiptUrl?: string;
  provider?: string;
  methodKind?: string;
  createdAt?: string;
  updatedAt?: string;
  refunds?: RefundInfo[];
}

interface RefundInfo {
  id: string;
  paymentId: string;
  status: string;
  amount: string;
  amountMinor?: number;
  reason?: string;
  providerRefundId?: string;
  merchantRefundId?: string;
  originalMerchantOrderId?: string;
  upiUtr?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PaymentStatusInfo {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentFailedAt?: string | null;
    paymentMethod: string;
    total: string;
    subtotal?: string;
    discountAmount?: string;
    shippingCharge?: string;
    deliveryAddress?: string;
    userInfo?: {
      name: string;
      email: string;
      phone?: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  payment?: PaymentTransactionInfo | null;
  transactions: PaymentTransactionInfo[];
  latestTransaction?: PaymentTransactionInfo;
  latestTransactionFailed?: boolean;
  latestTransactionFailureAt?: string | null;
  totalPaid: number;
  totalRefunded: number;
  refunds?: RefundInfo[];
  reconciliation?: {
    status: 'pending' | 'completed' | 'failed' | 'expired';
    attempt: number;
    nextPollAt: string;
    expiresAt: string;
    lastPolledAt?: string;
    lastStatus?: string;
    lastResponseCode?: string;
    lastError?: string;
    completedAt?: string;
  } | null;
}

// Payment status badge component
const PaymentStatusBadge = ({
  status,
  className = "",
  ...badgeProps
}: { status: string; className?: string } & ComponentProps<typeof Badge>) => {
  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
        return { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Paid' };
      case 'processing':
        return { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Processing' };
      case 'pending':
      case 'initiated':
        return { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' };
      case 'failed':
        return { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Failed' };
      case 'cancelled':
        return { color: 'bg-gray-100 text-gray-800', icon: XCircle, text: 'Cancelled' };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, text: 'Unknown' };
    }
  };

  const statusInfo = getStatusInfo(status);
  const Icon = statusInfo.icon;

  return (
    <Badge {...badgeProps} className={`${statusInfo.color} ${className} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {statusInfo.text}
    </Badge>
  );
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on Delivery',
  upi: 'UPI',
  cashfree: 'UPI',
  phonepe: 'UPI',
  card: 'Card',
  credit_card: 'Card',
  debit_card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  unselected: 'Not Provided',
};

const formatPaymentMethod = (method?: string | null) => {
  if (!method) return 'Not Provided';
  const normalized = method.toLowerCase();
  return PAYMENT_METHOD_LABELS[normalized] ?? method;
};

const isUpiMethod = (method?: string | null) => {
  if (!method) return false;
  const normalized = method.toLowerCase();
  return normalized === 'upi' || normalized === 'phonepe' || normalized === 'cashfree';
};

const normalizeStatus = (status?: string | null) => status?.toLowerCase() ?? '';

const formatIdentifier = (value: string, max: number = 18) => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

export interface AuthorizationFailureHandlers {
  setAuthorizationError: (message: string) => void;
  setReconciliationStatus: (status: 'idle' | 'processing' | 'complete') => void;
  setReconciliationMessage: (message: string | null) => void;
  setRetryError: (message: string | null) => void;
  setShouldStartPolling: (value: boolean) => void;
}

export function applyAuthorizationFailure(
  status: number,
  handlers: AuthorizationFailureHandlers,
): boolean {
  if (status === 401) {
    handlers.setAuthorizationError('Please sign in to view the latest payment status.');
    handlers.setReconciliationStatus('complete');
    handlers.setReconciliationMessage(null);
    handlers.setRetryError(null);
    handlers.setShouldStartPolling(false);
    return true;
  }

  if (status === 403) {
    handlers.setAuthorizationError("You do not have permission to view this order's payment details.");
    handlers.setReconciliationStatus('complete');
    handlers.setReconciliationMessage(null);
    handlers.setRetryError(null);
    handlers.setShouldStartPolling(false);
    return true;
  }

  return false;
}

export default function ThankYou() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderId, setOrderId] = useState<string>("");
  const [shouldStartPolling, setShouldStartPolling] = useState(false);
  const [reconciliationStatus, setReconciliationStatus] = useState<'idle' | 'processing' | 'complete'>('idle');
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);
  const [isRetryingPhonePe, setIsRetryingPhonePe] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [orderDate] = useState(new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }));

  useEffect(() => {
    // Get order data from session storage or URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get('orderId');
    
    const storedOrder = sessionStorage.getItem('lastOrder');
    if (storedOrder) {
      const orderInfo = JSON.parse(storedOrder) as OrderData;
      setOrderData(orderInfo);
      setOrderId(orderInfo.orderId);
      // Clear the stored order data
      sessionStorage.removeItem('lastOrder');
    } else if (orderIdParam) {
      setOrderId(orderIdParam);
    }
  }, []);

  const handleAuthorizationFailure = useCallback(
    (status: number) =>
      applyAuthorizationFailure(status, {
        setAuthorizationError,
        setReconciliationStatus,
        setReconciliationMessage,
        setRetryError,
        setShouldStartPolling,
      }),
    [
      setAuthorizationError,
      setReconciliationStatus,
      setReconciliationMessage,
      setRetryError,
      setShouldStartPolling,
    ],
  );

  useEffect(() => {
    if (!orderId || shouldStartPolling) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const hasPhonePeIndicators = ['merchantTransactionId', 'providerReferenceId', 'state', 'code', 'checksum', 'amount']
      .some((key) => Boolean(urlParams.get(key)));
    const shouldProbeReturn = isUpiMethod(orderData?.paymentMethod) || hasPhonePeIndicators;

    if (!shouldProbeReturn) {
      setReconciliationStatus('complete');
      setShouldStartPolling(true);
      return;
    }

    let cancelled = false;
    let unauthorized = false;

    const probe = async () => {
      try {
        setReconciliationStatus('processing');
        const query = new URLSearchParams({ orderId });
        ['merchantTransactionId', 'providerReferenceId', 'state', 'code', 'checksum', 'amount'].forEach((key) => {
          const value = urlParams.get(key);
          if (value) {
            query.set(key, value);
          }
        });

        const response = await fetch(`/api/payments/phonepe/return?${query.toString()}`, {
          headers: { Accept: 'application/json' },
        });

        if (handleAuthorizationFailure(response.status)) {
          unauthorized = true;
          return;
        }

        if (!response.ok) {
          throw new Error(`Return probe failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        if (payload?.status === 'processing') {
          setReconciliationStatus('processing');
          setReconciliationMessage(
            payload?.message ??
              'We are waiting for PhonePe to confirm your payment. This usually takes a few moments.'
          );
        } else {
          setReconciliationStatus('complete');
          setReconciliationMessage(null);
        }
      } catch (error) {
        console.error('Failed to record PhonePe return:', error);
        if (!cancelled && !unauthorized) {
          setReconciliationStatus('processing');
          setReconciliationMessage('We are waiting for PhonePe to confirm your payment. This usually takes a few moments.');
        }
      } finally {
        if (!cancelled && !unauthorized) {
          setShouldStartPolling(true);
        }
      }
    };

    probe();

    return () => {
      cancelled = true;
    };
  }, [orderId, orderData?.paymentMethod, shouldStartPolling, handleAuthorizationFailure]);

  const fetchOrderInfo = useCallback(async (): Promise<PaymentStatusInfo | null> => {
    const response = await fetch(`/api/payments/order-info/${orderId}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (handleAuthorizationFailure(response.status)) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch order info: ${response.status}`);
    }

    setAuthorizationError(null);
    return await response.json();
  }, [orderId, handleAuthorizationFailure]);

  // Fetch real-time payment status information
  const { data: paymentInfo, isLoading: isLoadingPayment } = useQuery<PaymentStatusInfo | null>({
    queryKey: ["/api/payments/order-info", orderId],
    enabled: Boolean(orderId) && shouldStartPolling,
    queryFn: fetchOrderInfo,
    refetchInterval: (queryData) => {
      // Stop polling on terminal states
      const data = queryData?.state?.data as PaymentStatusInfo | undefined;
      const latestStatus = data?.latestTransactionFailed
        ? 'failed'
        : normalizeStatus(data?.latestTransaction?.status);
      const orderPaymentStatus = normalizeStatus(data?.order?.paymentStatus);
      if (['completed', 'failed'].includes(latestStatus) || orderPaymentStatus === 'paid') {
        return false;
      }

      // Poll for UPI/PhonePe payments that are pending
      const isUpiPayment = isUpiMethod(orderData?.paymentMethod) ||
                          isUpiMethod(data?.order?.paymentMethod);
      if (!isUpiPayment) {
        return false;
      }

      const reconciliation = data?.reconciliation || undefined;
      if (reconciliation && reconciliation.status === 'pending') {
        const nextPollAt = new Date(reconciliation.nextPollAt).getTime();
        const delay = nextPollAt - Date.now();
        if (Number.isFinite(delay) && delay > 0) {
          return Math.max(Math.min(delay, 60000), 1000);
        }
      }

      return 5000;
    },
    retry: false
  });

  useEffect(() => {
    const normalized = normalizeStatus(paymentInfo?.order?.paymentStatus);
    if (['paid', 'completed'].includes(normalized)) {
      setReconciliationStatus('complete');
      setReconciliationMessage(null);
    } else if (normalized === 'failed') {
      setReconciliationStatus('complete');
      setReconciliationMessage((current) =>
        current ?? 'We were unable to confirm the payment with PhonePe. Please try again or use a different method.'
      );
    }
  }, [paymentInfo]);

  useEffect(() => {
    const reconciliation = paymentInfo?.reconciliation || null;
    if (!reconciliation) {
      return;
    }

    if (reconciliation.status === 'pending') {
      setReconciliationStatus('processing');
      const nextPollAt = new Date(reconciliation.nextPollAt).getTime();
      const secondsUntilNextPoll = Math.max(Math.round((nextPollAt - Date.now()) / 1000), 0);
      const baseMessage = 'We are waiting for PhonePe to confirm your payment.';
      setReconciliationMessage(
        secondsUntilNextPoll > 0
          ? `${baseMessage} We'll check again in about ${secondsUntilNextPoll} second${secondsUntilNextPoll === 1 ? '' : 's'}.`
          : `${baseMessage} Checking again shortly.`
      );
      return;
    }

    if (reconciliation.status === 'failed') {
      setReconciliationStatus('complete');
      setReconciliationMessage('PhonePe reported that this payment failed. Please try again or use a different payment method.');
      return;
    }

    if (reconciliation.status === 'expired') {
      setReconciliationStatus('complete');
      setReconciliationMessage('The PhonePe payment request expired before it was confirmed. Please initiate a new payment.');
      return;
    }

    if (reconciliation.status === 'completed') {
      setReconciliationStatus('complete');
      setReconciliationMessage(null);
    }
  }, [paymentInfo?.reconciliation]);

  useEffect(() => {
    if (paymentInfo?.reconciliation?.status !== 'expired') {
      setRetryError(null);
    }
  }, [paymentInfo?.reconciliation?.status]);

  // Get the current order data - prioritize paymentInfo data over sessionStorage
  const currentOrderData = paymentInfo?.order || orderData;
  const paymentStatusFromOrder = paymentInfo?.order?.paymentStatus;
  const normalizedPaymentStatus = normalizeStatus(paymentStatusFromOrder);
  const latestTransactionFailed =
    paymentInfo?.latestTransactionFailed === true || normalizeStatus(paymentInfo?.latestTransaction?.status) === 'failed';
  const latestTransactionFailureAt = paymentInfo?.latestTransactionFailureAt ?? null;
  const currentPaymentStatus = (() => {
    if (reconciliationStatus === 'processing') {
      return 'processing';
    }
    if (latestTransactionFailed && normalizedPaymentStatus !== 'paid') {
      return 'failed';
    }
    if (paymentStatusFromOrder && normalizedPaymentStatus && normalizedPaymentStatus !== 'pending') {
      return paymentStatusFromOrder;
    }
    return paymentStatusFromOrder || 'pending';
  })();
  const currentOrderStatus = paymentInfo?.order?.status || 'pending';
  const latestTransaction = paymentInfo?.latestTransaction;
  const canStartPhonePeRetry = paymentInfo?.reconciliation?.status === 'expired';

  const handlePhonePeRetry = async () => {
    if (!orderId || isRetryingPhonePe) {
      return;
    }

    setRetryError(null);
    setIsRetryingPhonePe(true);

    try {
      const response = await fetch('/api/payments/phonepe/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      if (handleAuthorizationFailure(response.status)) {
        return;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : `Retry request failed with status ${response.status}`;
        throw new Error(message);
      }

      setReconciliationStatus('processing');
      setReconciliationMessage('We are waiting for PhonePe to confirm your payment. This usually takes a few moments.');
      setShouldStartPolling(true);

      await queryClient.invalidateQueries({ queryKey: ["/api/payments/order-info", orderId] });

      if (payload?.data?.order?.paymentStatus) {
        queryClient.setQueryData(["/api/payments/order-info", orderId], (existing: unknown) => {
          if (!existing || typeof existing !== 'object') {
            return payload.data;
          }
          const current = existing as Record<string, any>;
          return {
            ...current,
            order: {
              ...(current.order ?? {}),
              ...payload.data.order,
            },
            reconciliation: payload.data.reconciliation ?? current.reconciliation ?? null,
          };
        });
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to start a new PhonePe payment attempt.';
      setRetryError(message);
    } finally {
      setIsRetryingPhonePe(false);
    }
  };

  // Dynamic header info based on payment status
  const getHeaderInfo = (paymentStatus: string, orderStatus: string) => {
    const normalizedPaymentStatus = paymentStatus.toLowerCase();
    const normalizedOrderStatus = orderStatus.toLowerCase();

    const confirmedStatuses = new Set(['confirmed', 'processing', 'shipped', 'delivered']);

    if (['paid', 'completed'].includes(normalizedPaymentStatus)) {
      if (confirmedStatuses.has(normalizedOrderStatus)) {
        return {
          icon: 'fas fa-check',
          iconColor: 'bg-green-600',
          title: 'Order Confirmed!',
          subtitle:
            'Thank you for your purchase. Your payment is confirmed and your order is moving to fulfillment.',
          titleColor: 'text-gray-900'
        };
      }
      return {
        icon: 'fas fa-check',
        iconColor: 'bg-green-600',
        title: 'Payment Received',
        subtitle: 'We\'ve received your payment. Your order will be confirmed shortly.',
        titleColor: 'text-gray-900'
      };
    }

    if (normalizedPaymentStatus === 'processing') {
      return {
        icon: 'fas fa-clock',
        iconColor: 'bg-yellow-600',
        title: 'Order Placed - Payment Processing',
        subtitle: 'Your payment is being processed. We\'ll update your order once the gateway responds.',
        titleColor: 'text-gray-900'
      };
    }

    if (normalizedPaymentStatus === 'pending' || normalizedPaymentStatus === 'initiated') {
      return {
        icon: 'fas fa-clock',
        iconColor: 'bg-yellow-600',
        title: 'Order Placed - Awaiting Payment',
        subtitle: 'Your order has been placed. Please complete the payment to confirm your order.',
        titleColor: 'text-gray-900'
      };
    }

    if (normalizedPaymentStatus === 'failed') {
      return {
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'bg-red-600',
        title: 'Order Placed - Payment Failed',
        subtitle:
          'Your order is saved but payment could not be processed. You can retry payment or contact support.',
        titleColor: 'text-gray-900'
      };
    }

    return {
      icon: 'fas fa-check',
      iconColor: 'bg-blue-600',
      title: 'Order Placed',
      subtitle: 'Your order has been successfully placed.',
      titleColor: 'text-gray-900'
    };
  };

  if (!currentOrderData && !orderData && !isLoadingPayment) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-600 mb-3 sm:mb-6">No order information available</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping-final">
          Continue Shopping
        </Button>
      </div>
    );
  }

  if (isLoadingPayment && !orderData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 sm:mb-4" />
        <p className="text-gray-600">Loading order information...</p>
      </div>
    );
  }

  const displayOrderData = orderData || (paymentInfo?.order ? {
    orderId: paymentInfo.order.id,
    total: paymentInfo.order.total,
    subtotal: paymentInfo.order.subtotal || paymentInfo.order.total,
    discountAmount: paymentInfo.order.discountAmount || '0',
    paymentMethod: paymentInfo.order.paymentMethod,
    deliveryAddress: paymentInfo.order.deliveryAddress || '',
    userInfo: paymentInfo.order.userInfo || {
      name: 'Customer',
      email: '',
    }
  } : null);

  if (!displayOrderData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-600 mb-3 sm:mb-6">No order information available</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping-final">
          Continue Shopping
        </Button>
      </div>
    );
  }

  const taxAmount = parseFloat(displayOrderData.subtotal) - (parseFloat(displayOrderData.subtotal) / 1.05);
  const shippingCharge = paymentInfo?.order?.shippingCharge
    ? parseFloat(paymentInfo.order.shippingCharge)
    : 50;
  const headerInfo = getHeaderInfo(currentPaymentStatus, currentOrderStatus);

  // Scroll to order confirmation on mount
  useEffect(() => {
    setTimeout(() => {
      scrollToContext('order-confirmation');
    }, 300);
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Dynamic Status Message */}
      <div id="order-confirmation" className="text-center mb-8">
        <div className={`w-16 h-16 ${headerInfo.iconColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
          <i className={`${headerInfo.icon} text-white text-2xl`}></i>
        </div>
        <h2 className={`text-3xl font-bold ${headerInfo.titleColor} mb-2`}>{headerInfo.title}</h2>
        <p className="text-gray-600">{headerInfo.subtitle}</p>
      </div>

      {authorizationError && (
        <div
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900"
          data-testid="authorization-error"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Authorization Required</h3>
              <p className="text-sm mt-1">{authorizationError}</p>
            </div>
          </div>
        </div>
      )}

      {reconciliationStatus === 'processing' && (
        <div
          className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900"
          data-testid="reconciliation-message"
        >
          <div className="flex items-start gap-3">
            <Loader2 className="h-5 w-5 mt-0.5 animate-spin" />
            <div className="flex-1">
              <h3 className="font-semibold">Processing Payment...</h3>
              <p className="text-sm mt-1">{reconciliationMessage || 'We are waiting for the payment to be confirmed. This usually takes a few moments.'}</p>
            </div>
          </div>
        </div>
      )}

      {canStartPhonePeRetry && retryError && (
        <div
          className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-900"
          data-testid="retry-error"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Retry Failed</h3>
              <p className="text-sm mt-1">{retryError}</p>
            </div>
          </div>
        </div>
      )}

      {canStartPhonePeRetry && (
        <div className="mb-6 rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 mt-0.5 text-yellow-700" />
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900">Payment Expired</h3>
              <p className="text-sm text-yellow-800 mt-1">
                The payment request expired before PhonePe could confirm it. Would you like to try again?
              </p>
              <Button
                onClick={handlePhonePeRetry}
                disabled={isRetryingPhonePe}
                className="mt-3"
                size="sm"
                data-testid="button-retry-phonepe"
              >
                {isRetryingPhonePe ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  'Retry Payment'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Order Details</h3>
          <PaymentStatusBadge status={currentPaymentStatus} />
        </div>

        <Separator className="mb-3 sm:mb-6" />

        {/* Price Breakdown */}
        <div className="space-y-3 mb-3 sm:mb-6">
          <h4 className="font-semibold text-gray-900">Price Details</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span data-testid="text-subtotal">₹{parseFloat(displayOrderData.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(displayOrderData.discountAmount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span data-testid="text-discount">-₹{parseFloat(displayOrderData.discountAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span data-testid="text-shipping">₹{shippingCharge.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span data-testid="text-total">₹{parseFloat(displayOrderData.total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <Separator className="mb-3 sm:mb-6" />

        {/* Order Information */}
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900">Order Information</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Order ID</span>
              <span className="font-mono text-xs" data-testid="text-order-id">
                #{displayOrderData.orderId.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Order Date</span>
              <span data-testid="text-order-date">{orderDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Method</span>
              <span data-testid="text-payment-method">{formatPaymentMethod(displayOrderData.paymentMethod)}</span>
            </div>
            {latestTransaction && (
              <>
                <Separator className="my-2" />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Transaction ID</span>
                    <span className="font-mono text-xs" data-testid="text-transaction-id">
                      {formatIdentifier(latestTransaction.id, 12)}
                    </span>
                  </div>
                  {latestTransaction.upiUtr && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">UPI Reference (UTR)</span>
                      <span className="font-mono text-xs" data-testid="text-upi-utr">
                        {formatIdentifier(latestTransaction.upiUtr, 16)}
                      </span>
                    </div>
                  )}
                  {latestTransaction.providerReferenceId && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provider Reference</span>
                      <span className="font-mono text-xs" data-testid="text-provider-reference">
                        {formatIdentifier(latestTransaction.providerReferenceId, 16)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {displayOrderData.deliveryAddress && (
          <>
            <Separator className="my-3 sm:my-6" />
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900">Delivery Address</h4>
              <p className="text-sm text-gray-600 whitespace-pre-line" data-testid="text-delivery-address">
                {displayOrderData.userInfo.name}
                {'\n'}
                {displayOrderData.deliveryAddress}
              </p>
            </div>
          </>
        )}

        {displayOrderData.userInfo.phone && (
          <>
            <Separator className="my-3 sm:my-6" />
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900">Contact Information</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <p data-testid="text-contact-phone">Phone: {displayOrderData.userInfo.phone}</p>
                {displayOrderData.userInfo.email && (
                  <p data-testid="text-contact-email">Email: {displayOrderData.userInfo.email}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {latestTransactionFailed && latestTransactionFailureAt && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 mt-0.5 text-red-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Transaction Failed</h3>
              <p className="text-sm text-red-800 mt-1">
                The payment transaction was not successful. You may retry the payment or choose a different payment method.
              </p>
              {latestTransactionFailureAt && (
                <p className="text-xs text-red-700 mt-2">
                  Failed at: {new Date(latestTransactionFailureAt).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping">
          Continue Shopping
        </Button>
        <Button 
          onClick={() => setLocation("/orders")} 
          variant="outline"
          data-testid="button-view-orders"
        >
          View All Orders
        </Button>
      </div>
    </div>
  );
}
