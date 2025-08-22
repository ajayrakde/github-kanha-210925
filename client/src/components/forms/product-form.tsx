import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/lib/types";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Price must be a positive number"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  stock: z.string().min(1, "Stock is required").refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "Stock must be a non-negative number"),
  isActive: z.boolean().default(true),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: Product | null;
  onClose: () => void;
}

export default function ProductForm({ product, onClose }: ProductFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || "",
      description: product?.description || "",
      price: product?.price || "",
      imageUrl: product?.imageUrl || "",
      stock: product?.stock?.toString() || "0",
      isActive: product?.isActive ?? true,
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = {
        ...data,
        price: data.price,
        stock: parseInt(data.stock),
        imageUrl: data.imageUrl || undefined,
      };
      
      const url = product ? `/api/products/${product.id}` : "/api/products";
      const method = product ? "PATCH" : "POST";
      
      const response = await apiRequest(method, url, payload);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: product ? "Product updated" : "Product created",
        description: product ? "Product has been successfully updated" : "Product has been successfully created",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: product ? "Failed to update product" : "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    createProductMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            {...form.register("name")}
            placeholder="Enter product name"
            className="mt-2"
            data-testid="input-product-name"
          />
          {form.formState.errors.name && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...form.register("description")}
            placeholder="Enter product description"
            rows={3}
            className="mt-2"
            data-testid="input-product-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price">Price (₹) *</Label>
            <Input
              id="price"
              {...form.register("price")}
              placeholder="0.00"
              className="mt-2"
              data-testid="input-product-price"
            />
            {form.formState.errors.price && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.price.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="stock">Stock Quantity *</Label>
            <Input
              id="stock"
              {...form.register("stock")}
              placeholder="0"
              className="mt-2"
              data-testid="input-product-stock"
            />
            {form.formState.errors.stock && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.stock.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            {...form.register("imageUrl")}
            placeholder="https://example.com/image.jpg"
            className="mt-2"
            data-testid="input-product-image"
          />
          {form.formState.errors.imageUrl && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.imageUrl.message}</p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={form.watch("isActive")}
            onCheckedChange={(checked) => form.setValue("isActive", checked)}
            data-testid="switch-product-active"
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          data-testid="button-cancel-product"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={createProductMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="button-save-product"
        >
          {createProductMutation.isPending ? "Saving..." : (product ? "Update Product" : "Create Product")}
        </Button>
      </div>
    </form>
  );
}
