import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function ThankYou() {
  const [, setLocation] = useLocation();
  const [orderDetails] = useState({
    id: '#ORD-' + Date.now().toString().slice(-6),
    total: '59,848',
    delivery: '3-5 business days'
  });

  useEffect(() => {
    // In a real app, this would come from order state or URL params
  }, []);

  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="mb-6">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check text-white text-2xl"></i>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Order Confirmed!</h2>
        <p className="text-gray-600">Thank you for your purchase. Your order has been successfully placed.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6 text-left">
        <h3 className="font-semibold text-gray-900 mb-4">Order Details</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Order ID:</span>
            <span className="font-mono font-medium" data-testid="text-order-id">{orderDetails.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Amount:</span>
            <span className="font-semibold" data-testid="text-final-total">₹{orderDetails.total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Payment Method:</span>
            <span>UPI Payment</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Estimated Delivery:</span>
            <span data-testid="text-delivery-time">{orderDetails.delivery}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button 
          className="w-full"
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
