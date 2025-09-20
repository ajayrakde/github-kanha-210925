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
import SettingsManagement from "@/components/admin/settings-management";
import ShippingRulesManagement from "@/components/admin/shipping-rules-management";
import type { Product, Offer } from "@shared/schema";
import type { AbandonedCart, PopularProduct, SalesTrend, ConversionMetrics } from "@/lib/types";

type TabValue = 'products' | 'orders' | 'offers' | 'users' | 'analytics' | 'shipping' | 'settings';

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div className="text-xl lg:text-2xl font-bold text-blue-600" data-testid="stat-total-sessions">{conversionMetrics.totalSessions}</div>
          <div className="text-xs lg:text-sm text-gray-600">Total Sessions</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
          <div className="text-xl lg:text-2xl font-bold text-green-600" data-testid="stat-orders-completed">{conversionMetrics.ordersCompleted}</div>
          <div className="text-xs lg:text-sm text-gray-600">Orders Completed</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
          <div className="text-xl lg:text-2xl font-bold text-purple-600" data-testid="stat-conversion-rate">{conversionMetrics.conversionRate}</div>
          <div className="text-xs lg:text-sm text-gray-600">Conversion Rate</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
          <div className="text-xl lg:text-2xl font-bold text-yellow-600" data-testid="stat-avg-order-value">₹{(conversionMetrics as any).averageOrderValue || '0'}</div>
          <div className="text-xs lg:text-sm text-gray-600">Avg Order Value</div>
        </div>
      </div>

      {/* Popular Products */}
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-3">Popular Products</h4>
        {popularProducts.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
              <i className="fas fa-chart-line text-gray-400 text-xl"></i>
            </div>
            <div className="text-gray-600 font-medium">No Product Data Available</div>
            <div className="text-sm text-gray-500 mt-1">Start getting orders to see popular products here</div>
          </div>
        ) : (
          <div className="space-y-2">
            {popularProducts.slice(0, 5).map((product, index) => (
              <div key={(product as any).productId || index} className="flex justify-between items-center bg-gray-50 p-2 rounded border" data-testid={`popular-product-${index}`}>
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm mr-3">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{(product as any).name || 'Unknown Product'}</div>
                    <div className="text-xs text-gray-600">{(product as any).orderCount || 0} orders</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-600 text-sm">₹{((product as any).totalRevenue || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sales Trends */}
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-3">Sales Trends (Last 7 Days)</h4>
        {salesTrends.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
              <i className="fas fa-chart-bar text-gray-400 text-xl"></i>
            </div>
            <div className="text-gray-600 font-medium">No Sales Data Available</div>
            <div className="text-sm text-gray-500 mt-1">Start making sales to see trends here</div>
          </div>
        ) : (
          <div className="space-y-2">
            {salesTrends.map((trend, index) => (
              <div key={(trend as any).date || index} className="flex justify-between items-center bg-gray-50 p-2 rounded border" data-testid={`sales-trend-${index}`}>
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs mr-3">
                    <i className="fas fa-calendar-alt"></i>
                  </div>
                  <div className="font-medium text-sm">{new Date((trend as any).date || new Date()).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">{(trend as any).orderCount || 0} orders</div>
                  <div className="text-xs text-green-600">₹{((trend as any).revenue || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abandoned Carts */}
      <div className="bg-white p-4 rounded-lg border">
        <h4 className="text-md font-semibold text-gray-800 mb-3">Recent Abandoned Carts</h4>
        {abandonedCarts.length === 0 ? (
          <div className="text-center py-8 bg-green-50 rounded-lg border-2 border-dashed border-green-200">
            <div className="mx-auto w-12 h-12 bg-green-200 rounded-full flex items-center justify-center mb-3">
              <i className="fas fa-check-circle text-green-500 text-xl"></i>
            </div>
            <div className="text-green-700 font-medium">Great News!</div>
            <div className="text-sm text-green-600 mt-1">No abandoned carts - customers are completing purchases!</div>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {abandonedCarts.slice(0, 10).map((cart, index) => (
              <div key={cart.sessionId} className="bg-amber-50 p-2 rounded border border-amber-200" data-testid={`abandoned-cart-${index}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-amber-200 rounded-full flex items-center justify-center text-amber-700 text-xs mr-3">
                      <i className="fas fa-shopping-cart"></i>
                    </div>
                    <div>
                      <div className="font-medium text-sm">Session: {cart.sessionId.slice(0, 8)}...</div>
                      <div className="text-xs text-gray-600">{cart.items} items • ₹{(cart.totalValue || 0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">
                      {new Date(cart.lastActivity).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
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
          onSuccess={() => {
            // No need to reload, auth hooks will automatically update
          }}
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
    { id: 'shipping', label: 'Shipping', icon: 'fas fa-truck' },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg transition-all duration-300 ease-in-out flex-shrink-0",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            {!sidebarCollapsed && (
              <h1 className="text-xl font-semibold text-gray-900 flex-1">Admin Panel</h1>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              data-testid="toggle-sidebar"
              className={cn(
                "p-2 hover:bg-gray-100 rounded-md border border-gray-300 font-bold text-lg",
                sidebarCollapsed && "mx-auto"
              )}
            >
              <span className="text-gray-600">
                {sidebarCollapsed ? "›" : "‹"}
              </span>
            </Button>
          </div>
          
          {/* Navigation */}
          <nav className={cn("flex-1 py-4 space-y-1", sidebarCollapsed ? "px-2" : "px-4")}>
            {sidebarItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabValue)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = (index + 1) % sidebarItems.length;
                    setActiveTab(sidebarItems[nextIndex].id as TabValue);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prevIndex = index === 0 ? sidebarItems.length - 1 : index - 1;
                    setActiveTab(sidebarItems[prevIndex].id as TabValue);
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab(item.id as TabValue);
                  }
                }}
                className={cn(
                  "w-full flex items-center text-sm font-medium rounded-lg transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
                  sidebarCollapsed ? "px-2 py-3 justify-center" : "px-4 py-3",
                  activeTab === item.id
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:shadow-sm"
                )}
                data-testid={`nav-${item.id}`}
                tabIndex={0}
                role="tab"
                aria-selected={activeTab === item.id}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <i className={cn(item.icon, "text-lg flex-shrink-0", !sidebarCollapsed && "mr-3")}></i>
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {activeTab === item.id && !sidebarCollapsed && (
                  <div className="absolute right-2 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
            ))}
          </nav>
          
          {/* Logout */}
          <div className={cn("border-t border-gray-200", sidebarCollapsed ? "p-2" : "p-4")}>
            <Button 
              variant="outline" 
              className={cn("w-full", sidebarCollapsed && "px-2")}
              onClick={() => logout()}
              data-testid="button-admin-logout"
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <i className={cn("fas fa-sign-out-alt flex-shrink-0", !sidebarCollapsed && "mr-2")}></i>
              {!sidebarCollapsed && <span>Logout</span>}
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
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Product Management</h3>
                  <p className="text-sm text-gray-600 mt-1">Manage your product catalog and inventory</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setShowProductForm(true)}
                    data-testid="button-add-product"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <i className="fas fa-plus mr-2"></i>Add Product
                  </Button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <ProductTable onEdit={handleProductEdit} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Order Management</h3>
                  <p className="text-sm text-gray-600 mt-1">Track and manage customer orders</p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={exportOrders}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-export-csv"
                  >
                    <i className="fas fa-download mr-2"></i>Export CSV
                  </Button>
                </div>
              </div>
              
              <div className="p-3 bg-white border-b border-gray-200">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-xl lg:text-2xl font-bold text-blue-600" data-testid="stat-total-orders">{stats.totalOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Total Orders</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <div className="text-xl lg:text-2xl font-bold text-green-600" data-testid="stat-revenue">₹{stats.revenue.toFixed(2)}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Total Revenue</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <div className="text-xl lg:text-2xl font-bold text-yellow-600" data-testid="stat-pending-orders">{stats.pendingOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Pending Orders</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="text-xl lg:text-2xl font-bold text-red-600" data-testid="stat-cancelled-orders">{stats.cancelledOrders}</div>
                    <div className="text-xs lg:text-sm text-gray-600">Cancelled Orders</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <OrderTable />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="offers" className="h-full">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 p-4 border-b border-gray-200 bg-white">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Offer Management</h3>
                    <p className="text-sm text-gray-600 mt-1">Create and manage discount codes and promotions</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setShowOfferForm(true)}
                      data-testid="button-create-offer"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <i className="fas fa-plus mr-2"></i>Create Offer
                    </Button>
                  </div>
                </div>
                <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
                  <div className="w-full overflow-x-auto">
                    <OfferTable onEdit={handleOfferEdit} />
                  </div>
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

            <TabsContent value="shipping" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <ShippingRulesManagement />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="h-full">
              <div className="h-full flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4">
                  <SettingsManagement />
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