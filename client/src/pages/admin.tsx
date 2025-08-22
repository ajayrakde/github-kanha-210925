import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProductTable from "@/components/admin/product-table";
import OrderTable from "@/components/admin/order-table";
import OfferTable from "@/components/admin/offer-table";
import UserManagement from "@/components/admin/user-management";
import ProductForm from "@/components/forms/product-form";
import OfferForm from "@/components/forms/offer-form";
import HybridLogin from "@/components/auth/hybrid-login";
import { useAdminAuth } from "@/hooks/use-auth";
import type { Product, Offer } from "@shared/schema";
import type { AbandonedCart, PopularProduct, SalesTrend, ConversionMetrics } from "@/lib/types";

type TabValue = 'products' | 'orders' | 'offers' | 'users' | 'analytics';

interface OrderStats {
  totalOrders: number;
  revenue: number;
  pendingOrders: number;
  cancelledOrders: number;
}

function AnalyticsTab({ abandonedCarts }: { abandonedCarts: AbandonedCart[] }) {
  // Additional analytics data
  const { data: popularProducts = [] } = useQuery<PopularProduct[]>({
    queryKey: ['/api/analytics/popular-products'],
  });

  const { data: salesTrends = [] } = useQuery<SalesTrend[]>({
    queryKey: ['/api/analytics/sales-trends'],
  });

  const { data: conversionMetrics } = useQuery<ConversionMetrics>({
    queryKey: ['/api/analytics/conversion-metrics'],
  });

  // Abandoned cart calculations
  const totalAbandonedCarts = abandonedCarts.length;
  const totalAbandonedValue = abandonedCarts.reduce((sum, cart) => sum + cart.totalValue, 0);
  const avgAbandonedValue = totalAbandonedCarts > 0 ? totalAbandonedValue / totalAbandonedCarts : 0;

  // Sales trends calculations
  const totalTrendRevenue = salesTrends.reduce((sum, trend) => sum + trend.revenue, 0);
  const totalTrendOrders = salesTrends.reduce((sum, trend) => sum + trend.orders, 0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Analytics Dashboard</h3>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600" data-testid="stat-conversion-rate">
            {conversionMetrics?.conversionRate.toFixed(1) || '0.0'}%
          </div>
          <div className="text-sm text-gray-600">Conversion Rate</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600" data-testid="stat-total-sessions">
            {conversionMetrics?.totalSessions || 0}
          </div>
          <div className="text-sm text-gray-600">Total Sessions</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-orange-600" data-testid="stat-abandoned-carts">{totalAbandonedCarts}</div>
          <div className="text-sm text-gray-600">Abandoned Carts</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600" data-testid="stat-abandoned-value">₹{totalAbandonedValue.toFixed(2)}</div>
          <div className="text-sm text-gray-600">Lost Revenue</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600" data-testid="stat-avg-abandoned-value">₹{avgAbandonedValue.toFixed(2)}</div>
          <div className="text-sm text-gray-600">Avg. Abandoned Value</div>
        </div>
      </div>

      {/* Popular Products */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Top Selling Products</h4>
        {popularProducts.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No product sales data available yet.
          </div>
        ) : (
          <div className="space-y-3">
            {popularProducts.slice(0, 5).map((item, index) => (
              <div key={item.product.id} className="bg-white p-4 rounded border" data-testid={`popular-product-${index}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{item.product.name}</div>
                    <div className="text-sm text-gray-600">{item.orderCount} orders • ₹{item.totalRevenue.toFixed(2)} revenue</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600">#{index + 1}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Trends */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Recent Sales Trends (Last 30 Days)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-3 rounded border">
            <div className="text-lg font-bold text-blue-600" data-testid="stat-trend-orders">{totalTrendOrders}</div>
            <div className="text-sm text-gray-600">Total Orders</div>
          </div>
          <div className="bg-white p-3 rounded border">
            <div className="text-lg font-bold text-green-600" data-testid="stat-trend-revenue">₹{totalTrendRevenue.toFixed(2)}</div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
        </div>
        {salesTrends.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No sales data available for the selected period.
          </div>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {salesTrends.slice(-10).map((trend, index) => (
              <div key={trend.date} className="bg-white p-3 rounded border flex justify-between" data-testid={`sales-trend-${index}`}>
                <span className="font-medium">{new Date(trend.date).toLocaleDateString()}</span>
                <span className="text-sm text-gray-600">{trend.orders} orders • ₹{trend.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abandoned Carts Details */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Recent Abandoned Carts</h4>
        {abandonedCarts.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No abandoned carts found. This means customers are completing their purchases! 🎉
          </div>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {abandonedCarts.slice(0, 10).map((cart, index) => (
              <div key={cart.sessionId} className="bg-white p-4 rounded border" data-testid={`abandoned-cart-${index}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">Session: {cart.sessionId.slice(0, 8)}...</div>
                    <div className="text-sm text-gray-600">{cart.items} items • ₹{cart.totalValue.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">
                      {new Date(cart.lastActivity).toLocaleDateString()}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(cart.lastActivity).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<TabValue>('products');
  const [showProductForm, setShowProductForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  // Order statistics
  const { data: stats = { totalOrders: 0, revenue: 0, pendingOrders: 0, cancelledOrders: 0 } } = useQuery<OrderStats>({
    queryKey: ['/api/admin/stats'],
    enabled: isAuthenticated,
  });

  // Abandoned cart analytics
  const { data: abandonedCarts = [] } = useQuery<AbandonedCart[]>({
    queryKey: ['/api/abandoned-carts'],
    enabled: isAuthenticated,
  });

  const handleProductEdit = (product: any) => {
    setEditingProduct(product as Product);
    setShowProductForm(true);
  };

  const handleOfferEdit = (offer: any) => {
    setEditingOffer(offer as Offer);
    setShowOfferForm(true);
  };

  const handleFormClose = () => {
    setShowProductForm(false);
    setShowOfferForm(false);
    setEditingProduct(null);
    setEditingOffer(null);
  };

  const exportOrders = () => {
    window.open('/api/admin/orders/export', '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <HybridLogin 
        userType="admin"
        title="Admin Portal"
        onSuccess={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Admin Dashboard</h2>
              <p className="text-gray-600">Manage your store and track performance</p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => logout()}
              data-testid="button-admin-logout"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>
              Logout
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-4 sm:mb-6">
              <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
              <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-[70vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Product Management</h3>
                  <Button 
                    onClick={() => setShowProductForm(true)}
                    data-testid="button-add-product"
                  >
                    <i className="fas fa-plus mr-2"></i>Add Product
                  </Button>
                </div>
                <ProductTable onEdit={handleProductEdit} />
              </div>
            </TabsContent>

            <TabsContent value="orders">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-[70vh] overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>
                  <Button 
                    onClick={exportOrders}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-export-csv"
                  >
                    <i className="fas fa-download mr-2"></i>Export CSV
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600" data-testid="stat-total-orders">{stats.totalOrders}</div>
                    <div className="text-sm text-gray-600">Total Orders</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600" data-testid="stat-revenue">₹{stats.revenue.toFixed(2)}</div>
                    <div className="text-sm text-gray-600">Total Revenue</div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600" data-testid="stat-pending-orders">{stats.pendingOrders}</div>
                    <div className="text-sm text-gray-600">Pending Orders</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-red-600" data-testid="stat-cancelled-orders">{stats.cancelledOrders}</div>
                    <div className="text-sm text-gray-600">Cancelled Orders</div>
                  </div>
                </div>

                <OrderTable />
              </div>
            </TabsContent>

            <TabsContent value="offers">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-[70vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Offer Management</h3>
                  <Button 
                    onClick={() => setShowOfferForm(true)}
                    data-testid="button-create-offer"
                  >
                    <i className="fas fa-plus mr-2"></i>Create Offer
                  </Button>
                </div>
                <OfferTable onEdit={handleOfferEdit} />
              </div>
            </TabsContent>

            <TabsContent value="users">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-[70vh] overflow-y-auto">
                <UserManagement />
              </div>
            </TabsContent>

            <TabsContent value="analytics">
              <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 h-[70vh] overflow-y-auto">
                <AnalyticsTab abandonedCarts={abandonedCarts} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={handleFormClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" aria-describedby="product-form-description">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
          </DialogHeader>
          <div id="product-form-description" className="sr-only">
            {editingProduct ? 'Form to edit existing product details' : 'Form to add a new product to the store'}
          </div>
          <ProductForm 
            product={editingProduct}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Offer Form Dialog */}
      <Dialog open={showOfferForm} onOpenChange={handleFormClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" aria-describedby="offer-form-description">
          <DialogHeader>
            <DialogTitle>
              {editingOffer ? 'Edit Offer' : 'Create New Offer'}
            </DialogTitle>
          </DialogHeader>
          <div id="offer-form-description" className="sr-only">
            {editingOffer ? 'Form to edit existing offer details' : 'Form to create a new discount offer'}
          </div>
          <OfferForm 
            offer={editingOffer}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}