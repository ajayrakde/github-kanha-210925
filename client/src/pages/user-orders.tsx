import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  upi: "UPI",
  cashfree: "UPI",
  phonepe: "UPI",
  card: "Card",
  credit_card: "Card",
  debit_card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
  unselected: "Not Provided",
};

const formatPaymentMethod = (method?: string | null) => {
  if (!method) return "Not Provided";
  const normalized = method.toLowerCase();
  return PAYMENT_METHOD_LABELS[normalized] ?? method;
};

const PAYMENT_STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  paid: { label: "Paid", classes: "bg-green-100 text-green-800" },
  completed: { label: "Paid", classes: "bg-green-100 text-green-800" },
  processing: { label: "Processing", classes: "bg-yellow-100 text-yellow-800" },
  pending: { label: "Pending", classes: "bg-yellow-100 text-yellow-800" },
  failed: { label: "Failed", classes: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", classes: "bg-gray-100 text-gray-800" },
};

interface PaymentRecord {
  id: string;
  status: string;
  provider: string;
  providerPaymentId?: string | null;
  providerTransactionId?: string | null;
  providerReferenceId?: string | null;
  methodKind?: string | null;
  upiPayerHandle?: string | null;
  upiUtr?: string | null;
  receiptUrl?: string | null;
  amountCapturedMinor?: number | null;
  amountAuthorizedMinor?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

const renderPaymentStatusBadge = (status?: string | null) => {
  const normalized = status?.toLowerCase() ?? "";
  const config = PAYMENT_STATUS_BADGES[normalized] ?? {
    label: status ?? "Unknown",
    classes: "bg-gray-100 text-gray-800",
  };

  return <Badge className={`ml-2 ${config.classes}`}>{config.label}</Badge>;
};

const formatIdentifier = (value?: string | null, max: number = 18) => {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const formatMinorAmount = (amount?: number | null) => {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "0.00";
  }
  return (amount / 100).toFixed(2);
};

const getLatestPayment = (payments?: PaymentRecord[]): PaymentRecord | undefined => {
  if (!payments || payments.length === 0) {
    return undefined;
  }

  const parseTimestamp = (value?: string) => {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...payments].sort((a, b) => parseTimestamp(b.updatedAt || b.createdAt) - parseTimestamp(a.updatedAt || a.createdAt))[0];
};

interface Order {
  id: string;
  userId: string;
  subtotal: string;
  discountAmount: string;
  shippingCharge: string;
  total: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  deliveryAddress: {
    id: string;
    userId: string;
    name: string;
    address: string;
    city: string;
    pincode: string;
    isPreferred: boolean;
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  items?: any[];
  payments?: PaymentRecord[];
}

export default function UserOrders() {
  const [, setLocation] = useLocation();
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // Check authentication status first
  const { data: authData } = useQuery<{ authenticated: boolean; user?: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });
  
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/auth/orders"],
    enabled: authData?.authenticated || false, // Only run when authenticated
    retry: false,
  });

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      'pending': { color: 'bg-yellow-500', label: 'Pending' },
      'confirmed': { color: 'bg-green-500', label: 'Confirmed' },
      'processing': { color: 'bg-blue-500', label: 'Processing' },
      'shipped': { color: 'bg-purple-500', label: 'Shipped' },
      'delivered': { color: 'bg-gray-500', label: 'Delivered' },
      'cancelled': { color: 'bg-red-500', label: 'Cancelled' },
    };
    
    const config = statusConfig[status] || { color: 'bg-gray-500', label: status };
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="space-y-3 sm:space-y-6">
          <Button
            onClick={() => setLocation("/")}
            variant="ghost"
            className="mb-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                  <div className="h-4 bg-gray-200 rounded w-64"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 overflow-x-hidden w-full">
      <div className="space-y-3 sm:space-y-6 min-w-0 w-full">
        {/* Back Button and Title */}
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-6 w-full">
        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white flex-shrink-0"
          data-testid="button-back-from-orders"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">My Orders</h2>
          <p className="text-gray-600 hidden sm:block">View your order history and track deliveries</p>
        </div>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded border border-gray-200">
          <div className="text-6xl mb-2 sm:mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-600 mb-3 sm:mb-6">Start shopping to see your orders here</p>
          <Button onClick={() => setLocation("/")} data-testid="button-start-shopping">
            Start Shopping
          </Button>
        </div>
      ) : (
        <div className="space-y-4 min-w-0 w-full">
          {orders.map(order => {
            const latestPayment = getLatestPayment(order.payments);

            const isExpanded = expandedOrders.has(order.id);
            
            return (
              <div key={order.id} className="bg-white rounded border border-gray-200 overflow-hidden min-w-0 w-full">
                <div className="p-4 sm:p-6 min-w-0 w-full overflow-hidden">
                  <div className="flex justify-between items-start gap-2 mb-2 sm:mb-4 min-w-0 w-full">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <h3 className="font-semibold text-gray-900 truncate">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 break-words">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {getStatusBadge(order.status)}
                    </div>
                  </div>

                  <Separator className="mb-2 sm:mb-4" />

                  <div className="space-y-2 text-sm w-full overflow-hidden">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600 flex-shrink-0">Subtotal:</span>
                      <span className="flex-shrink-0">₹{parseFloat(order.subtotal).toFixed(2)}</span>
                    </div>
                    {parseFloat(order.discountAmount) > 0 && (
                      <div className="flex justify-between text-green-600 gap-2">
                        <span className="flex-shrink-0">Discount:</span>
                        <span className="flex-shrink-0">-₹{parseFloat(order.discountAmount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-600 flex-shrink-0">Shipping:</span>
                      <span className="flex-shrink-0">₹{parseFloat(order.shippingCharge).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-base pt-2 border-t gap-2">
                      <span className="flex-shrink-0">Total:</span>
                      <span className="flex-shrink-0">₹{parseFloat(order.total).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Mobile: Collapsible Details */}
                  <div className="md:hidden mt-4">
                    <button
                      onClick={() => toggleOrderExpanded(order.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                      data-testid={`button-toggle-order-${order.id}`}
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Desktop: Always Show Details */}
                  <div className="hidden md:block w-full overflow-hidden">
                    <Separator className="my-4" />

                    <div className="space-y-2 text-sm min-w-0 w-full overflow-hidden">
                      <div className="flex items-start gap-2 min-w-0 w-full">
                        <span className="text-gray-600 flex-shrink-0">Delivery Address:</span>
                        <span className="flex-1 min-w-0 break-words overflow-hidden">
                          {order.deliveryAddress.address}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap min-w-0 w-full">
                        <span className="text-gray-600 flex-shrink-0">Payment:</span>
                        <span className="break-words">{formatPaymentMethod(order.paymentMethod)}</span>
                        {renderPaymentStatusBadge(order.paymentStatus)}
                      </div>
                    </div>

                    {latestPayment && (
                      <div className="mt-3 bg-gray-50 rounded-md p-4 text-sm text-gray-600 space-y-2 w-full overflow-hidden">
                        <div className="flex items-center justify-between min-w-0 gap-2 w-full">
                          <span className="flex-shrink-0">Gateway Status:</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="uppercase tracking-wide text-xs">
                              {latestPayment.provider}
                            </Badge>
                            {renderPaymentStatusBadge(latestPayment.status)}
                          </div>
                        </div>
                        {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId) && (
                          <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                            <span className="flex-shrink-0 whitespace-nowrap">Merchant Txn ID:</span>
                            <span className="font-mono text-xs truncate overflow-hidden text-right">
                              {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId)}
                            </span>
                          </div>
                        )}
                        {latestPayment.providerTransactionId && (
                          <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                            <span className="flex-shrink-0 whitespace-nowrap">Provider Txn ID:</span>
                            <span className="font-mono text-xs truncate overflow-hidden text-right">{formatIdentifier(latestPayment.providerTransactionId)}</span>
                          </div>
                        )}
                        {latestPayment.upiUtr && (
                          <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                            <span className="flex-shrink-0">UTR:</span>
                            <span className="font-mono text-xs truncate overflow-hidden text-right">{latestPayment.upiUtr}</span>
                          </div>
                        )}
                        {latestPayment.upiPayerHandle && (
                          <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                            <span className="flex-shrink-0">Payer VPA:</span>
                            <span className="font-mono text-xs truncate overflow-hidden text-right">{latestPayment.upiPayerHandle}</span>
                          </div>
                        )}
                        <div className="flex justify-between min-w-0 gap-2 w-full">
                          <span className="flex-shrink-0">Amount Paid:</span>
                          <span className="font-medium text-green-600 flex-shrink-0">
                            ₹{formatMinorAmount(latestPayment.amountCapturedMinor ?? latestPayment.amountAuthorizedMinor ?? 0)}
                          </span>
                        </div>
                        {latestPayment.receiptUrl && (
                          <div className="flex justify-between items-center min-w-0 gap-2 w-full">
                            <span className="flex-shrink-0">Receipt:</span>
                            <a
                              href={latestPayment.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate overflow-hidden"
                            >
                              View Receipt
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mobile: Collapsible Details */}
                  {isExpanded && (
                    <div className="md:hidden mt-4 pt-4 border-t w-full overflow-hidden">
                      <div className="space-y-2 text-sm min-w-0 w-full overflow-hidden">
                        <div className="flex items-start gap-2 min-w-0 w-full">
                          <span className="text-gray-600 flex-shrink-0">Delivery Address:</span>
                          <span className="flex-1 min-w-0 break-words overflow-hidden">
                            {order.deliveryAddress.address}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap min-w-0 w-full">
                          <span className="text-gray-600 flex-shrink-0">Payment:</span>
                          <span className="break-words">{formatPaymentMethod(order.paymentMethod)}</span>
                          {renderPaymentStatusBadge(order.paymentStatus)}
                        </div>
                      </div>

                      {latestPayment && (
                        <div className="mt-3 bg-gray-50 rounded-md p-4 text-sm text-gray-600 space-y-2 w-full overflow-hidden">
                          <div className="flex items-center justify-between min-w-0 gap-2 w-full">
                            <span className="flex-shrink-0">Gateway Status:</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Badge variant="outline" className="uppercase tracking-wide text-xs">
                                {latestPayment.provider}
                              </Badge>
                              {renderPaymentStatusBadge(latestPayment.status)}
                            </div>
                          </div>
                          {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId) && (
                            <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                              <span className="flex-shrink-0 whitespace-nowrap">Merchant Txn ID:</span>
                              <span className="font-mono text-xs truncate overflow-hidden text-right">
                                {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId)}
                              </span>
                            </div>
                          )}
                          {latestPayment.providerTransactionId && (
                            <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                              <span className="flex-shrink-0 whitespace-nowrap">Provider Txn ID:</span>
                              <span className="font-mono text-xs truncate overflow-hidden text-right">{formatIdentifier(latestPayment.providerTransactionId)}</span>
                            </div>
                          )}
                          {latestPayment.upiUtr && (
                            <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                              <span className="flex-shrink-0">UTR:</span>
                              <span className="font-mono text-xs truncate overflow-hidden text-right">{latestPayment.upiUtr}</span>
                            </div>
                          )}
                          {latestPayment.upiPayerHandle && (
                            <div className="flex justify-between min-w-0 gap-2 w-full overflow-hidden">
                              <span className="flex-shrink-0">Payer VPA:</span>
                              <span className="font-mono text-xs truncate overflow-hidden text-right">{latestPayment.upiPayerHandle}</span>
                            </div>
                          )}
                          <div className="flex justify-between min-w-0 gap-2 w-full">
                            <span className="flex-shrink-0">Amount Paid:</span>
                            <span className="font-medium text-green-600 flex-shrink-0">
                              ₹{formatMinorAmount(latestPayment.amountCapturedMinor ?? latestPayment.amountAuthorizedMinor ?? 0)}
                            </span>
                          </div>
                          {latestPayment.receiptUrl && (
                            <div className="flex justify-between items-center min-w-0 gap-2 w-full">
                              <span className="flex-shrink-0">Receipt:</span>
                              <a
                                href={latestPayment.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline truncate overflow-hidden"
                              >
                                View Receipt
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}