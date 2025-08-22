import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductTable from "@/components/admin/product-table";
import OrderTable from "@/components/admin/order-table";
import OfferTable from "@/components/admin/offer-table";
import AdminManagement from "@/components/admin/admin-management";
import ProductForm from "@/components/forms/product-form";
import OfferForm from "@/components/forms/offer-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/hooks/use-auth";
import AdminLogin from "@/components/auth/admin-login";

export default function Admin() {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState("products");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingOffer, setEditingOffer] = useState<any>(null);


  const { data: orders } = useQuery({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

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
      <div className="mb-6 flex justify-between items-center">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
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

        <TabsContent value="users" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <AdminManagement />
          </div>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
