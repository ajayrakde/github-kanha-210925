import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Order {
  id: string;
  user: {
    name: string | null;
    phone: string;
  };
  total: string;
  status: string;
  createdAt: string;
}

export default function OrderTable() {
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return 'default';
      case 'confirmed':
      case 'processing':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return 'text-green-800 bg-green-100';
      case 'confirmed':
      case 'processing':
        return 'text-blue-800 bg-blue-100';
      case 'pending':
        return 'text-yellow-800 bg-yellow-100';
      case 'cancelled':
        return 'text-red-800 bg-red-100';
      default:
        return 'text-gray-800 bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div>
        {/* Mobile Loading Cards */}
        <div className="md:hidden space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-20"></div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="h-8 bg-gray-200 rounded w-20"></div>
            </div>
          ))}
        </div>

        {/* Desktop Loading Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array(3).fill(0).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                      <div className="h-3 bg-gray-200 rounded w-24"></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-6 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-8 bg-gray-200 rounded w-12"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No orders found</div>
        <p className="text-gray-400 mt-2">Orders will appear here once customers start purchasing</p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-white border rounded-lg p-4 shadow-sm" data-testid={`order-card-${order.id}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-gray-900" data-testid={`order-id-${order.id}`}>
                  #{order.id.slice(0, 8)}...
                </div>
                <div className="text-xs text-gray-500" data-testid={`order-customer-${order.id}`}>
                  {order.user.name || 'N/A'} • {order.user.phone}
                </div>
              </div>
              <Badge variant={getStatusBadgeVariant(order.status)}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
              <div>
                <span className="text-gray-500">Amount:</span>
                <span className="ml-1 font-medium" data-testid={`order-amount-${order.id}`}>₹{parseFloat(order.total).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-500">Date:</span>
                <span className="ml-1" data-testid={`order-date-${order.id}`}>{new Date(order.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 w-full"
              data-testid={`button-view-order-${order.id}`}
            >
              <i className="fas fa-eye mr-1"></i>View Details
            </Button>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => (
              <tr key={order.id} data-testid={`order-row-${order.id}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" data-testid={`order-id-${order.id}`}>
                  #{order.id.slice(0, 8)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900" data-testid={`order-customer-name-${order.id}`}>
                    {order.user.name || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-500" data-testid={`order-customer-phone-${order.id}`}>
                    {order.user.phone}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-testid={`order-amount-${order.id}`}>
                  ₹{parseFloat(order.total).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-testid={`order-date-${order.id}`}>
                  {new Date(order.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                    data-testid={`button-view-order-${order.id}`}
                  >
                    <i className="fas fa-eye"></i>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}