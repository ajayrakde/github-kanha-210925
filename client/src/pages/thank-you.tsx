import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Printer, Download } from "lucide-react";
import { downloadElementAsImage, printElementWithStyles } from "@/lib/export-order";

interface OrderItemSummary {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: string;
  imageUrl?: string | null;
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
  items?: OrderItemSummary[];
  shippingCharge?: string;
  createdAt?: string;
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
    items?: OrderItemSummary[];
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
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

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

  const displayOrderData = orderData || (paymentInfo?.order
    ? {
        orderId: paymentInfo.order.id,
        total: paymentInfo.order.total,
        subtotal: paymentInfo.order.subtotal || paymentInfo.order.total,
        discountAmount: paymentInfo.order.discountAmount || '0',
        paymentMethod: paymentInfo.order.paymentMethod,
        deliveryAddress: paymentInfo.order.deliveryAddress || '',
        userInfo: paymentInfo.order.userInfo || {
          name: 'Customer',
          email: '',
        },
        items: paymentInfo.order.items ?? [],
        shippingCharge: paymentInfo.order.shippingCharge,
        createdAt: paymentInfo.order.createdAt,
      }
    : null);

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

  const parseAmount = (value: string | number | null | undefined) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const subtotalValue = parseAmount(displayOrderData.subtotal);
  const discountAmountValue = parseAmount(displayOrderData.discountAmount);
  const totalAmountValue = parseAmount(displayOrderData.total);
  const shippingChargeValue = parseAmount(paymentInfo?.order?.shippingCharge ?? displayOrderData.shippingCharge);
  const orderItems = displayOrderData.items ?? [];
  const orderCreatedAt = paymentInfo?.order?.createdAt ?? displayOrderData.createdAt ?? null;
  const orderDateDisplay = orderCreatedAt
    ? new Date(orderCreatedAt).toLocaleString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
  const hasDiscount = discountAmountValue > 0;

  const handlePrintReceipt = () => {
    if (!receiptRef.current) {
      return;
    }
    try {
      printElementWithStyles(receiptRef.current, {
        title: `Order ${displayOrderData.orderId.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Failed to open print dialog for order receipt:', error);
    }
  };

  const handleSaveReceipt = async () => {
    if (!receiptRef.current) {
      return;
    }
    try {
      setIsSavingReceipt(true);
      await downloadElementAsImage(receiptRef.current, `order-${displayOrderData.orderId}.png`);
    } catch (error) {
      console.error('Failed to save order receipt image:', error);
    } finally {
      setIsSavingReceipt(false);
    }
  };
  const headerInfo = getHeaderInfo(currentPaymentStatus, currentOrderStatus);

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Dynamic Status Message */}
      <div className="text-center mb-8">
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
            <div>
              <p className="font-medium">Unable to load live payment updates</p>
              <p className="text-sm leading-relaxed">{authorizationError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Receipt */}
      <div
        ref={receiptRef}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-3 sm:mb-6"
      >
        <div className="text-center mb-3 sm:mb-6">
          <h3 className="text-2xl font-semibold text-gray-900">Payment Receipt</h3>
          <p className="text-sm text-gray-500 mt-2">Order Date: {orderDateDisplay}</p>
        </div>

        <Separator className="mb-3 sm:mb-6" />

        {/* Order Details */}
        <div className="space-y-4 mb-3 sm:mb-6">
          <div className="flex justify-between">
            <span className="text-gray-600">Order ID:</span>
            <span className="font-mono font-medium" data-testid="text-order-id">
              #{displayOrderData.orderId.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Customer Name:</span>
            <span>{displayOrderData.userInfo.name}</span>
          </div>
          {displayOrderData.userInfo.email && (
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span>{displayOrderData.userInfo.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Delivery Address:</span>
            <span className="text-right max-w-xs">{displayOrderData.deliveryAddress}</span>
          </div>
        </div>

        <Separator className="mb-3 sm:mb-6" />

        {orderItems.length > 0 && (
          <>
            <div className="mb-3 sm:mb-6">
              <h4 className="font-semibold text-gray-900 mb-3">Items Ordered</h4>
              <div className="space-y-3">
                {orderItems.map((item) => {
                  const unitPrice = parseAmount(item.price);
                  const lineTotal = unitPrice * item.quantity;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:p-4"
                    >
                      <div className="flex items-start gap-3">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-12 w-12 rounded-md object-cover border border-gray-200"
                          />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-1">Qty: {item.quantity}</p>
                          <p className="text-xs text-gray-400">Product ID: {item.productId.slice(0, 8).toUpperCase()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">₹{lineTotal.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">₹{unitPrice.toFixed(2)} each</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator className="mb-3 sm:mb-6" />
          </>
        )}

        {/* Price Breakdown */}
        <div className="space-y-3 mb-3 sm:mb-6">
          <h4 className="font-semibold text-gray-900">Price Details</h4>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal (incl. tax):</span>
            <span>₹{subtotalValue.toFixed(2)}</span>
          </div>
          {hasDiscount && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount Applied:</span>
              <span>-₹{discountAmountValue.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Shipping Charges:</span>
            <span>₹{shippingChargeValue.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold text-lg">
            <span>Total Amount Paid:</span>
            <span className="text-green-600" data-testid="text-final-total">
              ₹{totalAmountValue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-3 sm:mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-credit-card text-blue-600 mr-2"></i>
              <span className="font-medium">Payment Method:</span>
            </div>
            <span>{formatPaymentMethod(displayOrderData.paymentMethod)}</span>
          </div>
          
          {/* Payment Status */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center">
              <i className="fas fa-check-circle text-green-600 mr-2"></i>
              <span className="font-medium">Payment Status:</span>
            </div>
            <div className="flex items-center gap-2">
              {isLoadingPayment && shouldStartPolling ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking...</span>
                </div>
              ) : (
                <PaymentStatusBadge status={currentPaymentStatus} data-testid="badge-payment-status" />
              )}
            </div>
          </div>
          {reconciliationStatus === 'processing' && reconciliationMessage && (
            <p className="text-xs text-gray-500 text-right mt-1" data-testid="text-reconciliation-message">
              {reconciliationMessage}
            </p>
          )}

          {/* Transaction Info for UPI payments */}
          {isUpiMethod(displayOrderData.paymentMethod) && latestTransaction && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 space-y-1">
                {latestTransaction.merchantTransactionId && (
                  <div className="flex justify-between">
                    <span>Merchant Txn ID:</span>
                    <span className="font-mono text-xs" data-testid="text-transaction-id">
                      {formatIdentifier(latestTransaction.merchantTransactionId)}
                    </span>
                  </div>
                )}
                {latestTransaction.providerTransactionId && (
                  <div className="flex justify-between">
                    <span>Provider Txn ID:</span>
                    <span className="font-mono text-xs">
                      {formatIdentifier(latestTransaction.providerTransactionId)}
                    </span>
                  </div>
                )}
                {(latestTransaction.upiInstrumentLabel || latestTransaction.upiInstrumentVariant) && (
                  <div className="flex justify-between">
                    <span>UPI Instrument:</span>
                    <span className="font-medium text-xs">
                      {latestTransaction.upiInstrumentLabel ?? latestTransaction.upiInstrumentVariant}
                    </span>
                  </div>
                )}
                {latestTransaction.upiUtr && (
                  <div className="flex justify-between">
                    <span>UTR:</span>
                    <span className="font-mono text-xs">{latestTransaction.upiUtr}</span>
                  </div>
                )}
                {latestTransaction.upiPayerHandle && (
                  <div className="flex justify-between">
                    <span>Payer VPA:</span>
                    <span className="font-mono text-xs break-all">{latestTransaction.upiPayerHandle}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Amount Paid:</span>
                  <span className="font-medium text-green-600" data-testid="text-amount-paid">
                    ₹{paymentInfo.totalPaid.toFixed(2)}
                  </span>
                </div>
                {latestTransaction.receiptUrl && (
                  <div className="flex justify-between items-center">
                    <span>Receipt:</span>
                    <a
                      href={latestTransaction.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Receipt
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {(latestTransaction?.refunds?.length ?? 0) > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Refunds</h4>
              <div className="space-y-2">
                {latestTransaction?.refunds?.map((refund) => (
                  <div
                    key={refund.id}
                    className="text-xs text-gray-600 border border-dashed border-gray-200 rounded-md p-2 space-y-1"
                  >
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="font-medium capitalize">{refund.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span className="font-medium">
                        ₹{((refund.amountMinor ?? 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    {refund.upiUtr && (
                      <div className="flex justify-between">
                        <span>UTR:</span>
                        <span className="font-mono">{formatIdentifier(refund.upiUtr)}</span>
                      </div>
                    )}
                    {refund.merchantRefundId && (
                      <div className="flex justify-between">
                        <span>Merchant Refund ID:</span>
                        <span className="font-mono">{formatIdentifier(refund.merchantRefundId)}</span>
                      </div>
                    )}
                    {refund.originalMerchantOrderId && (
                      <div className="flex justify-between">
                        <span>Original Order ID:</span>
                        <span className="font-mono">{formatIdentifier(refund.originalMerchantOrderId)}</span>
                      </div>
                    )}
                    {refund.reason && (
                      <div className="flex justify-between">
                        <span>Reason:</span>
                        <span className="font-medium">{refund.reason}</span>
                      </div>
                    )}
                    {refund.createdAt && (
                      <div className="flex justify-between">
                        <span>Requested:</span>
                        <span>{new Date(refund.createdAt).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center">
              <i className="fas fa-truck text-blue-600 mr-2"></i>
              <span className="font-medium">Estimated Delivery:</span>
            </div>
            <span data-testid="text-delivery-time">3-5 business days</span>
          </div>
        </div>

        {/* Payment Status Messages */}
        {isUpiMethod(displayOrderData.paymentMethod) && paymentInfo?.order && (
          <div className="mb-3 sm:mb-6">
            {['pending', 'processing'].includes(normalizeStatus(paymentInfo.order.paymentStatus)) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <Clock className="w-5 h-5 text-yellow-600 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">Payment Processing</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Your payment is being processed. This page will update automatically once payment is confirmed.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {(paymentInfo.order.paymentStatus === 'failed' || latestTransactionFailed) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <XCircle className="w-5 h-5 text-red-600 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Payment Failed</h4>
                    <p className="text-sm text-red-700 mt-1">
                      Your payment could not be processed. Please contact support if amount was debited from your account.
                    </p>
                    {latestTransactionFailureAt && (
                      <p className="text-xs text-red-600 mt-2">
                        Last failed attempt recorded at {new Date(latestTransactionFailureAt).toLocaleString('en-IN')}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {paymentInfo.order.paymentStatus === 'paid' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-green-800">Payment Successful</h4>
                    <p className="text-sm text-green-700 mt-1">
                      Your payment has been successfully processed. Your order is now confirmed and will be shipped soon.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <Separator className="mb-3 sm:mb-6" />

        {/* Policy Information - At the bottom, not as warning */}
        <div className="text-sm text-gray-600 space-y-2">
          <h4 className="font-semibold text-gray-700 mb-3">Store Policies</h4>
          <div className="grid gap-2">
            <div className="flex items-start">
              <span className="mr-2">•</span>
              <span>All products are non-returnable and non-cancellable once ordered.</span>
            </div>
            <div className="flex items-start">
              <span className="mr-2">•</span>
              <span>Refunds are issued only for damaged, defective, or wrong items delivered.</span>
            </div>
            <div className="flex items-start">
              <span className="mr-2">•</span>
              <span>Please accept delivery and raise refund requests on the same day with photo/video proof.</span>
            </div>
            <div className="flex items-start">
              <span className="mr-2">•</span>
              <span>Refunds are processed within 3 working days or at the earliest possible time.</span>
            </div>
            <div className="flex items-start">
              <span className="mr-2">•</span>
              <span>Please track courier messages/calls and be available on the delivery day.</span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mb-3 sm:mb-6"
        data-print-hidden="true"
      >
        <Button
          variant="outline"
          className="sm:w-auto"
          onClick={handlePrintReceipt}
          data-testid="button-print-order"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print Receipt
        </Button>
        <Button
          variant="outline"
          className="sm:w-auto"
          onClick={handleSaveReceipt}
          disabled={isSavingReceipt}
          data-testid="button-save-order"
        >
          {isSavingReceipt ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {isSavingReceipt ? 'Saving…' : 'Save Snapshot'}
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 text-center">
        {canStartPhonePeRetry && (
          <div className="space-y-2">
            <Button
              className="w-full max-w-md bg-indigo-600 hover:bg-indigo-700"
              onClick={handlePhonePeRetry}
              disabled={isRetryingPhonePe}
              data-testid="button-phonepe-retry"
            >
              {isRetryingPhonePe && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {isRetryingPhonePe ? 'Restarting…' : 'Start again'}
            </Button>
            {retryError && (
              <p className="text-sm text-red-600" role="alert">
                {retryError}
              </p>
            )}
          </div>
        )}
        {latestTransactionFailed && displayOrderData && (
          <Button
            className="w-full max-w-md bg-red-600 hover:bg-red-700"
            onClick={() => setLocation(`/payment?orderId=${displayOrderData.orderId}`)}
            data-testid="button-retry-payment"
          >
            Retry Payment
          </Button>
        )}
        <Button
          className="w-full max-w-md bg-blue-600 hover:bg-blue-700"
          onClick={() => setLocation("/")}
          data-testid="button-continue-shopping-final"
        >
          Continue Shopping
        </Button>
        <p className="text-sm text-gray-600">
          You will receive an SMS confirmation on your registered phone number.
        </p>
      </div>
    </div>
  );
}