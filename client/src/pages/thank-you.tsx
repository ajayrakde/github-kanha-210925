import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

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

interface PaymentStatusInfo {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    total: string;
    createdAt: string;
    updatedAt: string;
  };
  transactions: Array<{
    id: string;
    status: string;
    amount: string;
    merchantTransactionId: string;
    createdAt: string;
    updatedAt: string;
  }>;
  latestTransaction?: {
    id: string;
    status: string;
    amount: string;
    merchantTransactionId: string;
    createdAt: string;
    updatedAt: string;
  };
  totalPaid: number;
  totalRefunded: number;
}

// Payment status badge component
const PaymentStatusBadge = ({ status, className = "" }: { status: string; className?: string }) => {
  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
        return { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Paid' };
      case 'pending':
      case 'initiated':
        return { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Processing' };
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
    <Badge className={`${statusInfo.color} ${className} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {statusInfo.text}
    </Badge>
  );
};

export default function ThankYou() {
  const [, setLocation] = useLocation();
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderId, setOrderId] = useState<string>("");
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

  // Fetch real-time payment status information
  const { data: paymentInfo, isLoading: isLoadingPayment } = useQuery<PaymentStatusInfo>({
    queryKey: ["/api/payments/order-info", orderId],
    enabled: Boolean(orderId),
    refetchInterval: (queryData) => {
      // Stop polling on terminal states
      const data = queryData?.state?.data as PaymentStatusInfo | undefined;
      if (data?.latestTransaction?.status === 'completed' || 
          data?.latestTransaction?.status === 'failed' || 
          data?.order?.paymentStatus === 'paid') {
        return false;
      }
      // Poll for UPI/PhonePe payments that are pending
      const isUpiPayment = orderData?.paymentMethod === 'upi' || 
                          data?.order?.paymentMethod === 'upi' ||
                          data?.order?.paymentMethod === 'phonepe';
      return isUpiPayment ? 5000 : false;
    },
    retry: false
  });

  // Get the current order data - prioritize paymentInfo data over sessionStorage
  const currentOrderData = paymentInfo?.order || orderData;
  const currentPaymentStatus = paymentInfo?.order?.paymentStatus || 'pending';
  const currentOrderStatus = paymentInfo?.order?.status || 'pending';

  // Dynamic header info based on payment status
  const getHeaderInfo = (paymentStatus: string, orderStatus: string) => {
    if (paymentStatus === 'paid' && orderStatus === 'confirmed') {
      return {
        icon: 'fas fa-check',
        iconColor: 'bg-green-600',
        title: 'Order Confirmed!',
        subtitle: 'Thank you for your purchase. Your order has been successfully placed and payment confirmed.',
        titleColor: 'text-gray-900'
      };
    } else if (paymentStatus === 'pending') {
      return {
        icon: 'fas fa-clock',
        iconColor: 'bg-yellow-600', 
        title: 'Order Placed - Payment Processing',
        subtitle: 'Your order has been placed. We\'re processing your payment and will update you shortly.',
        titleColor: 'text-gray-900'
      };
    } else if (paymentStatus === 'failed') {
      return {
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'bg-red-600',
        title: 'Order Placed - Payment Failed',
        subtitle: 'Your order has been placed but payment could not be processed. You can retry payment or contact support.',
        titleColor: 'text-gray-900'
      };
    } else {
      return {
        icon: 'fas fa-check',
        iconColor: 'bg-blue-600',
        title: 'Order Placed',
        subtitle: 'Your order has been successfully placed.',
        titleColor: 'text-gray-900'
      };
    }
  };

  if (!currentOrderData && !orderData && !isLoadingPayment) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-600 mb-6">No order information available</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping-final">
          Continue Shopping
        </Button>
      </div>
    );
  }

  if (isLoadingPayment && !orderData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading order information...</p>
      </div>
    );
  }

  const displayOrderData = orderData || (paymentInfo?.order ? {
    orderId: paymentInfo.order.id,
    total: paymentInfo.order.total,
    subtotal: paymentInfo.order.total, // Use total as subtotal fallback
    discountAmount: '0',
    paymentMethod: paymentInfo.order.paymentMethod,
    deliveryAddress: 'Loading address...',
    userInfo: {
      name: 'Customer',
      email: '',
    }
  } : null);

  if (!displayOrderData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-600 mb-6">No order information available</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping-final">
          Continue Shopping
        </Button>
      </div>
    );
  }

  const taxAmount = parseFloat(displayOrderData.subtotal) - (parseFloat(displayOrderData.subtotal) / 1.05);
  const shippingCharge = 50;
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

      {/* Payment Receipt */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-semibold text-gray-900">Payment Receipt</h3>
          <p className="text-sm text-gray-500 mt-2">Order Date: {orderDate}</p>
        </div>

        <Separator className="mb-6" />

        {/* Order Details */}
        <div className="space-y-4 mb-6">
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

        <Separator className="mb-6" />

        {/* Price Breakdown */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold text-gray-900">Price Details</h4>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal (incl. tax):</span>
            <span>₹{parseFloat(displayOrderData.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(displayOrderData.discountAmount) > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount Applied:</span>
              <span>-₹{parseFloat(displayOrderData.discountAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Shipping Charges:</span>
            <span>₹{shippingCharge.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold text-lg">
            <span>Total Amount Paid:</span>
            <span className="text-green-600" data-testid="text-final-total">
              ₹{parseFloat(displayOrderData.total).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-credit-card text-blue-600 mr-2"></i>
              <span className="font-medium">Payment Method:</span>
            </div>
            <span>{displayOrderData.paymentMethod === 'upi' ? 'UPI Payment' : 'Cash on Delivery'}</span>
          </div>
          
          {/* Payment Status */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center">
              <i className="fas fa-check-circle text-green-600 mr-2"></i>
              <span className="font-medium">Payment Status:</span>
            </div>
            <div className="flex items-center gap-2">
              {isLoadingPayment ? (
                <div className="flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking...</span>
                </div>
              ) : paymentInfo?.order ? (
                <PaymentStatusBadge status={paymentInfo.order.paymentStatus} data-testid="badge-payment-status" />
              ) : (
                <PaymentStatusBadge status="pending" data-testid="badge-payment-status" />
              )}
            </div>
          </div>

          {/* Transaction Info for UPI payments */}
          {displayOrderData.paymentMethod === 'upi' && paymentInfo?.latestTransaction && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Transaction ID:</span>
                  <span className="font-mono text-xs" data-testid="text-transaction-id">
                    {paymentInfo.latestTransaction.merchantTransactionId.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Paid:</span>
                  <span className="font-medium text-green-600" data-testid="text-amount-paid">
                    ₹{paymentInfo.totalPaid.toFixed(2)}
                  </span>
                </div>
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
        {displayOrderData.paymentMethod === 'upi' && paymentInfo?.order && (
          <div className="mb-6">
            {paymentInfo.order.paymentStatus === 'pending' && (
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
            
            {paymentInfo.order.paymentStatus === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <XCircle className="w-5 h-5 text-red-600 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-red-800">Payment Failed</h4>
                    <p className="text-sm text-red-700 mt-1">
                      Your payment could not be processed. Please contact support if amount was debited from your account.
                    </p>
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

        <Separator className="mb-6" />

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

      {/* Action Buttons */}
      <div className="space-y-3 text-center">
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