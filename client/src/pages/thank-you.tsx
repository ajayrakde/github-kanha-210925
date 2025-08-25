import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

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

export default function ThankYou() {
  const [, setLocation] = useLocation();
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderDate] = useState(new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }));

  useEffect(() => {
    // Get order data from session storage
    const storedOrder = sessionStorage.getItem('lastOrder');
    if (storedOrder) {
      setOrderData(JSON.parse(storedOrder));
      // Clear the stored order data
      sessionStorage.removeItem('lastOrder');
    }
  }, []);

  if (!orderData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-600 mb-6">No order information available</p>
        <Button onClick={() => setLocation("/")} data-testid="button-continue-shopping-final">
          Continue Shopping
        </Button>
      </div>
    );
  }

  const taxAmount = parseFloat(orderData.subtotal) - (parseFloat(orderData.subtotal) / 1.05);
  const shippingCharge = 50;

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Success Message */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check text-white text-2xl"></i>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Order Confirmed!</h2>
        <p className="text-gray-600">Thank you for your purchase. Your order has been successfully placed.</p>
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
              #{orderData.orderId.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Customer Name:</span>
            <span>{orderData.userInfo.name}</span>
          </div>
          {orderData.userInfo.email && (
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span>{orderData.userInfo.email}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Delivery Address:</span>
            <span className="text-right max-w-xs">{orderData.deliveryAddress}</span>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Price Breakdown */}
        <div className="space-y-3 mb-6">
          <h4 className="font-semibold text-gray-900">Price Details</h4>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal (incl. tax):</span>
            <span>₹{parseFloat(orderData.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(orderData.discountAmount) > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount Applied:</span>
              <span>-₹{parseFloat(orderData.discountAmount).toFixed(2)}</span>
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
              ₹{parseFloat(orderData.total).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <i className="fas fa-check-circle text-green-600 mr-2"></i>
              <span className="font-medium">Payment Method:</span>
            </div>
            <span>{orderData.paymentMethod === 'upi' ? 'UPI Payment' : 'Cash on Delivery'}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center">
              <i className="fas fa-truck text-blue-600 mr-2"></i>
              <span className="font-medium">Estimated Delivery:</span>
            </div>
            <span data-testid="text-delivery-time">3-5 business days</span>
          </div>
        </div>

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