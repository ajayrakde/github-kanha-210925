import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { downloadElementAsImage, printElementWithStyles } from "@/lib/export-order";

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

const parsePrice = (value?: string | null) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
  items?: OrderItem[];
  payments?: PaymentRecord[];
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string;
  product?: {
    id: string;
    name: string;
    displayImageUrl?: string | null;
    imageUrl?: string | null;
  };
}

export default function UserOrders() {
  const [, setLocation] = useLocation();
  const orderRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [savingSnapshotId, setSavingSnapshotId] = useState<string | null>(null);

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

  const attachOrderRef = (orderId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      orderRefs.current.set(orderId, element);
    } else {
      orderRefs.current.delete(orderId);
    }
  };

  const handlePrintOrder = (orderId: string) => {
    const element = orderRefs.current.get(orderId);
    if (!element) {
      return;
    }

    try {
      printElementWithStyles(element, { title: `Order ${orderId.toUpperCase()}` });
    } catch (error) {
      console.error('Failed to open print dialog for order summary:', error);
    }
  };

  const handleSaveOrder = async (orderId: string) => {
    const element = orderRefs.current.get(orderId);
    if (!element) {
      return;
    }

    try {
      setSavingSnapshotId(orderId);
      await downloadElementAsImage(element, `order-${orderId}.png`);
    } catch (error) {
      console.error('Failed to save order snapshot:', error);
    } finally {
      setSavingSnapshotId(null);
    }
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
      <div className="max-w-7xl mx-auto px-4">
        <div className="space-y-3 sm:space-y-3 sm:space-y-6">
          <Button
            onClick={() => setLocation("/")}
            variant="ghost"
            className="-ml-2 mb-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
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
    <div className="max-w-7xl mx-auto px-4">
      <div className="space-y-3 sm:space-y-3 sm:space-y-6">
        {/* Back Button and Title */}
        <div className="flex sm:flex-row items-center sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
        <Button
          onClick={() => setLocation("/")}
          variant="ghost"
          className="-ml-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          data-testid="button-back-from-orders"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">My Orders</h2>
          <p className="text-gray-600 hidden sm:block">View your order history and track deliveries</p>
        </div>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="text-6xl mb-2 sm:mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-600 mb-3 sm:mb-6">Start shopping to see your orders here</p>
          <Button onClick={() => setLocation("/")} data-testid="button-start-shopping">
            Start Shopping
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const latestPayment = getLatestPayment(order.payments);
            const orderItems = order.items ?? [];
            const isSavingSnapshot = savingSnapshotId === order.id;

            return (
              <div key={order.id} className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
                <div
                  ref={attachOrderRef(order.id)}
                  className="space-y-4"
                >
                  <div className="flex justify-between items-start mb-2 sm:mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                  </div>

                  <Separator className="mb-2 sm:mb-4" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span>₹{parsePrice(order.subtotal).toFixed(2)}</span>
                    </div>
                    {parsePrice(order.discountAmount) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount:</span>
                        <span>-₹{parsePrice(order.discountAmount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Shipping:</span>
                      <span>₹{parsePrice(order.shippingCharge).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-base pt-2 border-t">
                      <span>Total:</span>
                      <span>₹{parsePrice(order.total).toFixed(2)}</span>
                    </div>
                  </div>

                  {orderItems.length > 0 && (
                    <div className="my-4 space-y-3">
                      <Separator />
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Items</h4>
                        <div className="space-y-3">
                          {orderItems.map((item) => {
                            const unitPrice = parsePrice(item.price);
                            const lineTotal = unitPrice * item.quantity;
                            return (
                              <div
                                key={item.id}
                                className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:p-4"
                              >
                                <div className="flex items-start gap-3">
                                  {item.product?.displayImageUrl || item.product?.imageUrl ? (
                                    <img
                                      src={item.product.displayImageUrl ?? item.product.imageUrl ?? undefined}
                                      alt={item.product?.name ?? 'Product image'}
                                      className="h-12 w-12 rounded-md object-cover border border-gray-200"
                                    />
                                  ) : null}
                                  <div>
                                    <p className="font-medium text-gray-900">{item.product?.name ?? 'Product'}</p>
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
                    </div>
                  )}

                  <Separator className="my-4" />

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start">
                      <span className="text-gray-600 mr-2">Delivery Address:</span>
                      <span className="flex-1">
                        {order.deliveryAddress.address}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-600">Payment:</span>
                      <span>{formatPaymentMethod(order.paymentMethod)}</span>
                      {renderPaymentStatusBadge(order.paymentStatus)}
                    </div>
                  </div>

                  {latestPayment && (
                    <div className="mt-3 bg-gray-50 rounded-md p-4 text-sm text-gray-600 space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Gateway Status:</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="uppercase tracking-wide text-xs">
                            {latestPayment.provider}
                          </Badge>
                          {renderPaymentStatusBadge(latestPayment.status)}
                        </div>
                      </div>
                      {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId) && (
                        <div className="flex justify-between">
                          <span>Merchant Txn ID:</span>
                          <span className="font-mono text-xs">
                            {formatIdentifier(latestPayment.providerPaymentId || latestPayment.providerReferenceId)}
                          </span>
                        </div>
                      )}
                      {latestPayment.providerTransactionId && (
                        <div className="flex justify-between">
                          <span>Provider Txn ID:</span>
                          <span className="font-mono text-xs">{formatIdentifier(latestPayment.providerTransactionId)}</span>
                        </div>
                      )}
                      {latestPayment.upiUtr && (
                        <div className="flex justify-between">
                          <span>UTR:</span>
                          <span className="font-mono text-xs">{latestPayment.upiUtr}</span>
                        </div>
                      )}
                      {latestPayment.upiPayerHandle && (
                        <div className="flex justify-between">
                          <span>Payer VPA:</span>
                          <span className="font-mono text-xs break-all">{latestPayment.upiPayerHandle}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Amount Paid:</span>
                        <span className="font-medium text-green-600">
                          ₹{formatMinorAmount(latestPayment.amountCapturedMinor ?? latestPayment.amountAuthorizedMinor ?? 0)}
                        </span>
                      </div>
                      {latestPayment.receiptUrl && (
                        <div className="flex justify-between items-center">
                          <span>Receipt:</span>
                          <a
                            href={latestPayment.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View Receipt
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3" data-print-hidden="true">
                  <Button
                    variant="outline"
                    className="sm:w-auto"
                    onClick={() => handlePrintOrder(order.id)}
                    data-testid={`button-print-order-${order.id}`}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Summary
                  </Button>
                  <Button
                    variant="outline"
                    className="sm:w-auto"
                    onClick={() => handleSaveOrder(order.id)}
                    disabled={isSavingSnapshot}
                    data-testid={`button-save-order-${order.id}`}
                  >
                    {isSavingSnapshot ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {isSavingSnapshot ? 'Saving…' : 'Save Snapshot'}
                  </Button>
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