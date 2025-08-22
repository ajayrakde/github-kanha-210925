import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductTable from "@/components/admin/product-table";
import OrderTable from "@/components/admin/order-table";
import OfferTable from "@/components/admin/offer-table";
import ProductForm from "@/components/forms/product-form";
import OfferForm from "@/components/forms/offer-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";

export default function Admin() {
  const [activeTab, setActiveTab] = useState("products");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingOffer, setEditingOffer] = useState<any>(null);

  const { data: abandonedCarts } = useQuery({
    queryKey: ["/api/admin/abandoned-carts"],
  });

  const { data: orders } = useQuery({
    queryKey: ["/api/orders"],
  });

  const stats = {
    totalOrders: Array.isArray(orders) ? orders.length : 0,
    revenue: Array.isArray(orders) ? orders.reduce((sum: number, order: any) => sum + parseFloat(order.total), 0) : 0,
    pendingOrders: Array.isArray(orders) ? orders.filter((o: any) => o.status === 'pending').length : 0,
    cancelledOrders: Array.isArray(orders) ? orders.filter((o: any) => o.status === 'cancelled').length : 0,
  };

  const handleProductEdit = (product: any) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleOfferEdit = (offer: any) => {
    setEditingOffer(offer);
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

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Admin Dashboard</h2>
        <p className="text-gray-600">Manage your store and track performance</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
          <TabsTrigger value="carts" data-testid="tab-carts">Abandoned Carts</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
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

        <TabsContent value="orders" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
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

        <TabsContent value="offers" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
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

        <TabsContent value="carts" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Abandoned Carts</h3>
              <div className="text-sm text-gray-500">Last 30 days</div>
            </div>

            {!abandonedCarts || abandonedCarts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">No abandoned carts found</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cart Value</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {abandonedCarts.map((cart: any) => (
                      <tr key={cart.sessionId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono" data-testid={`cart-session-${cart.sessionId}`}>
                          {cart.sessionId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-testid={`cart-items-${cart.sessionId}`}>
                          {cart.items} items
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-testid={`cart-value-${cart.sessionId}`}>
                          ₹{cart.totalValue?.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-testid={`cart-activity-${cart.sessionId}`}>
                          {new Date(cart.lastActivity).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={handleFormClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
          </DialogHeader>
          <ProductForm 
            product={editingProduct}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      {/* Offer Form Dialog */}
      <Dialog open={showOfferForm} onOpenChange={handleFormClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingOffer ? 'Edit Offer' : 'Create New Offer'}
            </DialogTitle>
          </DialogHeader>
          <OfferForm 
            offer={editingOffer}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
