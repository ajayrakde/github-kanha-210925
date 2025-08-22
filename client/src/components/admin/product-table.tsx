import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/lib/types";

interface ProductTableProps {
  onEdit: (product: Product) => void;
}

export default function ProductTable({ onEdit }: ProductTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiRequest("DELETE", `/api/products/${productId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Product deleted",
        description: "Product has been successfully deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div>
        {/* Mobile Loading Cards */}
        <div className="md:hidden space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="h-12 w-12 bg-gray-200 rounded-md"></div>
                  <div className="ml-3 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="flex space-x-2">
                <div className="h-8 bg-gray-200 rounded flex-1"></div>
                <div className="h-8 bg-gray-200 rounded flex-1"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Loading Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Array(3).fill(0).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 bg-gray-200 rounded-md"></div>
                      <div className="ml-4 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-32"></div>
                        <div className="h-3 bg-gray-200 rounded w-20"></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-6 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="h-8 bg-gray-200 rounded w-16"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No products found</div>
        <p className="text-gray-400 mt-2">Add your first product to get started</p>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {products.map((product) => (
          <div key={product.id} className="bg-white border rounded-lg p-4 shadow-sm" data-testid={`product-card-${product.id}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center">
                <img 
                  className="h-12 w-12 rounded-md object-cover" 
                  src={product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=48&h=48`}
                  alt="Product" 
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900" data-testid={`product-name-${product.id}`}>
                    {product.name}
                  </div>
                  <div className="text-xs text-gray-500">ID: {product.id.slice(0, 8)}...</div>
                </div>
              </div>
              <Badge variant={product.isActive ? "default" : "secondary"}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
              <div>
                <span className="text-gray-500">Price:</span>
                <span className="ml-1 font-medium" data-testid={`product-price-${product.id}`}>₹{parseFloat(product.price).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-500">Stock:</span>
                <span className="ml-1 font-medium" data-testid={`product-stock-${product.id}`}>{product.stock}</span>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(product)}
                className="text-blue-600 hover:text-blue-700 flex-1"
                data-testid={`button-edit-product-${product.id}`}
              >
                <i className="fas fa-edit mr-1"></i>Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteProductMutation.mutate(product.id)}
                disabled={deleteProductMutation.isPending}
                className="text-red-600 hover:text-red-700 flex-1"
                data-testid={`button-delete-product-${product.id}`}
              >
                <i className="fas fa-trash mr-1"></i>Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id} data-testid={`product-row-${product.id}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <img 
                      className="h-10 w-10 rounded-md object-cover" 
                      src={product.imageUrl || `https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?ixlib=rb-4.0.3&auto=format&fit=crop&w=40&h=40`}
                      alt="Product" 
                    />
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900" data-testid={`product-table-name-${product.id}`}>
                        {product.name}
                      </div>
                      <div className="text-sm text-gray-500">ID: {product.id.slice(0, 8)}...</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-testid={`product-table-price-${product.id}`}>
                  ₹{parseFloat(product.price).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" data-testid={`product-table-stock-${product.id}`}>
                  {product.stock}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={product.isActive ? "default" : "secondary"}>
                    {product.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(product)}
                      className="text-blue-600 hover:text-blue-700"
                      data-testid={`button-edit-product-${product.id}`}
                    >
                      <i className="fas fa-edit"></i>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteProductMutation.mutate(product.id)}
                      disabled={deleteProductMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                      data-testid={`button-delete-product-${product.id}`}
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}