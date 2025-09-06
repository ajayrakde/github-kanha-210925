import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Order {
  id: string;
  userId: string;
  subtotal: string;
  discountAmount: string;
  total: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
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
}

export default function UserOrders() {
  const [, setLocation] = useLocation();
  
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
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
      <div className="space-y-6">
        <Button 
          onClick={() => setLocation("/")}
          variant="ghost" 
          className="-ml-2 mb-2 hover:bg-gray-100"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-5 bg-gray-200 rounded w-32"></div>
                <div className="h-4 bg-gray-200 rounded w-48"></div>
                <div className="h-4 bg-gray-200 rounded w-64"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button 
        onClick={() => setLocation("/")}
        variant="ghost" 
        className="-ml-2 mb-2 hover:bg-gray-100"
        data-testid="button-back-from-orders"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">My Orders</h2>
        <p className="text-gray-600">View your order history and track deliveries</p>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-600 mb-6">Start shopping to see your orders here</p>
          <Button onClick={() => setLocation("/")} data-testid="button-start-shopping">
            Start Shopping
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
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

              <Separator className="mb-4" />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>₹{parseFloat(order.subtotal).toFixed(2)}</span>
                </div>
                {parseFloat(order.discountAmount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-₹{parseFloat(order.discountAmount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping:</span>
                  <span>₹50.00</span>
                </div>
                <div className="flex justify-between font-semibold text-base pt-2 border-t">
                  <span>Total:</span>
                  <span>₹{parseFloat(order.total).toFixed(2)}</span>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2 text-sm">
                <div className="flex items-start">
                  <span className="text-gray-600 mr-2">Delivery Address:</span>
                  <span className="flex-1">
                    {order.deliveryAddress.address}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-600 mr-2">Payment:</span>
                  <span>{order.paymentMethod === 'upi' ? 'UPI' : 'Cash on Delivery'}</span>
                  <Badge className="ml-2 bg-green-100 text-green-800">
                    {order.paymentStatus === 'completed' ? 'Paid' : 'Pending'}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}