import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  const { data: popularProducts = [] } = useQuery<PopularProduct[]>({
    queryKey: ['/api/analytics/popular-products'],
  });

  const { data: salesTrends = [] } = useQuery<SalesTrend[]>({
    queryKey: ['/api/analytics/sales-trends'],
  });

  const { data: conversionMetrics = { totalSessions: '0', ordersCompleted: '0', conversionRate: '0%', averageOrderValue: '0' } } = useQuery<ConversionMetrics>({
    queryKey: ['/api/analytics/conversion-metrics'],
  });

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Analytics Dashboard</h3>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600" data-testid="stat-total-sessions">{conversionMetrics.totalSessions}</div>
          <div className="text-sm text-gray-600">Total Sessions</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600" data-testid="stat-orders-completed">{conversionMetrics.ordersCompleted}</div>
          <div className="text-sm text-gray-600">Orders Completed</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600" data-testid="stat-conversion-rate">{conversionMetrics.conversionRate}</div>
          <div className="text-sm text-gray-600">Conversion Rate</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600" data-testid="stat-avg-order-value">₹{conversionMetrics.averageOrderValue}</div>
          <div className="text-sm text-gray-600">Avg Order Value</div>
        </div>
      </div>

      {/* Popular Products */}
      <div className="bg-white p-6 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-4">Popular Products</h4>
        {popularProducts.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No product data available yet. Check back after some orders! 📈
          </div>
        ) : (
          <div className="space-y-3">
            {popularProducts.slice(0, 5).map((product, index) => (
              <div key={product.productId} className="flex justify-between items-center bg-gray-50 p-3 rounded" data-testid={`popular-product-${index}`}>
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-gray-600">{product.orderCount} orders</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600">₹{product.totalRevenue.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Trends */}
      <div className="bg-white p-6 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-4">Sales Trends (Last 7 Days)</h4>
        {salesTrends.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No sales data available yet. Start making sales to see trends! 📊
          </div>
        ) : (
          <div className="space-y-3">
            {salesTrends.map((trend, index) => (
              <div key={trend.date} className="flex justify-between items-center bg-gray-50 p-3 rounded" data-testid={`sales-trend-${index}`}>
                <div className="font-medium">{new Date(trend.date).toLocaleDateString()}</div>
                <div className="text-right">
                  <div className="font-semibold">{trend.orderCount} orders</div>
                  <div className="text-sm text-green-600">₹{trend.revenue.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abandoned Carts */}
      <div className="bg-white p-6 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-4">Recent Abandoned Carts</h4>
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

export default function Admin() {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<TabValue>('products');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="text-lg text-gray-600">Loading admin portal...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HybridLogin 
          userType="admin"
          title="Admin Portal"
          onSuccess={() => window.location.reload()}
        />
      </div>
    );
  }

  const sidebarItems = [
    { id: 'products', label: 'Products', icon: 'fas fa-box' },
    { id: 'orders', label: 'Orders', icon: 'fas fa-shopping-cart' },
    { id: 'offers', label: 'Offers', icon: 'fas fa-tags' },
    { id: 'users', label: 'Users', icon: 'fas fa-users' },
    { id: 'analytics', label: 'Analytics', icon: 'fas fa-chart-bar' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Always visible */}
      <div className="w-64 bg-white shadow-lg">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabValue)}
                className={cn(
                  "w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeTab === item.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                data-testid={`nav-${item.id}`}
              >
                <i className={cn(item.icon, "mr-3 text-lg")}></i>
                {item.label}
              </button>
            ))}
          </nav>
          
          {/* Logout */}
          <div className="p-4 border-t border-gray-200">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => logout()}
              data-testid="button-admin-logout"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>
              Logout
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center h-16 px-4 sm:px-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {sidebarItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
              <p className="text-sm text-gray-600">Manage your store and track performance</p>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
            <TabsContent value="products">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <h3 className="text-lg font-semibold text-gray-900">Product Management</h3>
                <Button 
                  onClick={() => setShowProductForm(true)}
                  data-testid="button-add-product"
                >
                  <i className="fas fa-plus mr-2"></i>Add Product
                </Button>
              </div>
              <div className="bg-gray-50 p-4">
                <ProductTable onEdit={handleProductEdit} />
              </div>
            </TabsContent>

            <TabsContent value="orders">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>
                <Button 
                  onClick={exportOrders}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-export-csv"
                >
                  <i className="fas fa-download mr-2"></i>Export CSV
                </Button>
              </div>
              
              <div className="p-4 bg-white border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              </div>

              <div className="bg-gray-50 p-4">
                <OrderTable />
              </div>
            </TabsContent>

            <TabsContent value="offers" className="h-full">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 p-4 border-b border-gray-200 bg-white">
                  <h3 className="text-lg font-semibold text-gray-900">Offer Management</h3>
                  <Button 
                    onClick={() => setShowOfferForm(true)}
                    data-testid="button-create-offer"
                  >
                    <i className="fas fa-plus mr-2"></i>Create Offer
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
                  <OfferTable onEdit={handleOfferEdit} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="users" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <UserManagement />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <AnalyticsTab abandonedCarts={abandonedCarts} />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="product-form-description">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-product">
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
          </DialogHeader>
          <div id="product-form-description" className="sr-only">
            {editingProduct ? 'Form to edit existing product details' : 'Form to add a new product to the store'}
          </div>
          <ProductForm 
            product={editingProduct as any}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Offer Form Dialog */}
      <Dialog open={showOfferForm} onOpenChange={setShowOfferForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="offer-form-description">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-offer">
              {editingOffer ? 'Edit Offer' : 'Create New Offer'}
            </DialogTitle>
          </DialogHeader>
          <div id="offer-form-description" className="sr-only">
            {editingOffer ? 'Form to edit existing offer details' : 'Form to create a new discount offer'}
          </div>
          <OfferForm 
            offer={editingOffer as any}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}