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
import { ObjectUploader } from "@/components/ObjectUploader";
import type { UploadResult } from "@uppy/core";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Eye, FileText } from "lucide-react";
import { useState } from "react";

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  brand: z.string().optional(),
  classification: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Price must be a positive number"),
  images: z.array(z.string()).max(5, "Maximum 5 images allowed").optional(),
  displayImageUrl: z.string().optional(),
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
  const [showDescriptionPreview, setShowDescriptionPreview] = useState(false);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    mode: "onChange", // Enable real-time validation
    defaultValues: {
      name: product?.name || "",
      brand: product?.brand || "",
      classification: product?.classification || "",
      category: product?.category || "",
      description: product?.description || "",
      price: product?.price || "",
      images: product?.images || [],
      displayImageUrl: product?.displayImageUrl || "",
      isActive: product?.isActive ?? true,
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = {
        name: data.name,
        brand: data.brand || undefined,
        classification: data.classification || undefined,
        category: data.category || undefined,
        description: data.description || undefined,
        price: data.price,
        imageUrl: data.images?.[0] || undefined, // Use first image as primary
        images: data.images || [],
        displayImageUrl: data.displayImageUrl || undefined,
        isActive: data.isActive,
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
    onError: (error: any) => {
      console.error('Product form error:', error);
      let errorMessage = product ? "Failed to update product" : "Failed to create product";
      
      // Show specific validation errors if available
      if (error?.message && error.message.includes('Invalid product data')) {
        errorMessage = "Please check all required fields and try again.";
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    // Force get the absolute latest values from the form
    const latestImages = form.getValues("images") || [];
    const latestDisplayImage = form.getValues("displayImageUrl") || "";
    
    const finalFormData = {
      ...data,
      images: latestImages,
      displayImageUrl: latestDisplayImage,
    };
    
    console.log('=== FORM SUBMISSION DEBUG ===');
    console.log('Original form data:', data);
    console.log('Latest images from form:', latestImages);
    console.log('Latest display image:', latestDisplayImage);
    console.log('Final form data being sent:', finalFormData);
    console.log('================================');
    
    createProductMutation.mutate(finalFormData);
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

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              {...form.register("brand")}
              placeholder="Enter brand name"
              className="mt-2"
              data-testid="input-product-brand"
            />
            {form.formState.errors.brand && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.brand.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="classification">Classification</Label>
            <Input
              id="classification"
              {...form.register("classification")}
              placeholder="e.g., Electronics"
              className="mt-2"
              data-testid="input-product-classification"
            />
            {form.formState.errors.classification && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.classification.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              {...form.register("category")}
              placeholder="e.g., Smartphones"
              className="mt-2"
              data-testid="input-product-category"
            />
            {form.formState.errors.category && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.category.message}</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="description">Description</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDescriptionPreview(!showDescriptionPreview)}
              className="text-xs"
            >
              {showDescriptionPreview ? (
                <><FileText size={14} className="mr-1" /> Edit</>
              ) : (
                <><Eye size={14} className="mr-1" /> Preview</>
              )}
            </Button>
          </div>
          {showDescriptionPreview ? (
            <div className="min-h-[80px] border rounded-md p-3 bg-gray-50 dark:bg-gray-900">
              <MarkdownRenderer content={form.watch('description') || ''} />
            </div>
          ) : (
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="Enter product description (Markdown supported: **bold**, *italic*, [links](url), lists, etc.)"
              rows={4}
              className="mt-0"
              data-testid="input-product-description"
            />
          )}
        </div>

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
          <Label htmlFor="images">Product Images (Max 5)</Label>
          <div className="mt-2 space-y-3">
            <ObjectUploader
              maxNumberOfFiles={5}
              maxFileSize={5242880} // 5MB each
              onGetUploadParameters={async () => {
                const response = await apiRequest("POST", "/api/objects/upload");
                const data = await response.json();
                return {
                  method: "PUT" as const,
                  url: data.uploadURL,
                };
              }}
              onComplete={(result) => {
                if (result.successful && result.successful.length > 0) {
                  const newImages = result.successful.map((file) => {
                    const uploadUrl = file.uploadURL as string;
                    const url = new URL(uploadUrl);
                    const pathParts = url.pathname.split('/');
                    const objectId = pathParts[pathParts.length - 1];
                    return `/objects/uploads/${objectId}`;
                  });
                  
                  // Append to existing images or replace
                  const currentImages = form.getValues("images") || [];
                  const allImages = [...currentImages, ...newImages].slice(0, 5); // Max 5 images
                  
                  // Update form values and trigger re-render
                  form.setValue("images", allImages, { 
                    shouldDirty: true, 
                    shouldTouch: true, 
                    shouldValidate: true 
                  });
                  
                  // Set display image if not already set and this is the first image
                  if (!form.getValues("displayImageUrl") && allImages.length > 0) {
                    form.setValue("displayImageUrl", allImages[0], { 
                      shouldDirty: true, 
                      shouldTouch: true 
                    });
                  }
                  
                  // Force form re-render to update the images field
                  form.trigger("images");
                  form.trigger("displayImageUrl");
                  
                  console.log('Images updated:', allImages);
                  console.log('Form images value after update:', form.getValues("images"));
                }
              }}
              buttonClassName="w-full bg-blue-600 hover:bg-blue-700 h-32 border-2 border-dashed border-blue-300 hover:border-blue-400"
            >
              <div className="flex flex-col items-center gap-2">
                <i className="fas fa-cloud-upload-alt text-2xl"></i>
                <span className="text-sm font-medium">Drop files here or click to upload</span>
                <span className="text-xs text-gray-500">Upload 1-5 product images (Max 5MB each)</span>
              </div>
            </ObjectUploader>
            
            {form.watch("images") && (form.watch("images") || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">
                  Uploaded Images ({form.watch("images")?.length}/5):
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.watch("images")?.map((imagePath: string, index: number) => (
                    <div key={index} className="relative group">
                      <div className={`w-16 h-16 bg-gray-100 rounded border-2 flex items-center justify-center text-xs text-gray-600 relative cursor-pointer transition-all ${
                        form.watch("displayImageUrl") === imagePath ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                      }`}
                      onClick={() => form.setValue("displayImageUrl", imagePath)}
                      data-testid={`image-${index}`}
                      >
                        <i className="fas fa-image text-gray-400"></i>
                        {form.watch("displayImageUrl") === imagePath && (
                          <div className="absolute -top-2 -left-2 w-5 h-5 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center">
                            ✓
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentImages = form.getValues("images") || [];
                            const newImages = currentImages.filter((_, i) => i !== index);
                            form.setValue("images", newImages);
                            // Clear display image if it's being removed
                            if (form.getValues("displayImageUrl") === imagePath) {
                              form.setValue("displayImageUrl", newImages[0] || "");
                            }
                          }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-image-${index}`}
                        >
                          ×
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 w-16 truncate text-center">
                        {form.watch("displayImageUrl") === imagePath ? "Display" : `Image ${index + 1}`}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  <i className="fas fa-info-circle mr-1"></i>Click on an image to set it as the display image for the product card
                </div>
                <button
                  type="button"
                  onClick={() => {
                    form.setValue("images", [], { shouldDirty: true, shouldTouch: true });
                    form.setValue("displayImageUrl", "", { shouldDirty: true, shouldTouch: true });
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                  data-testid="button-clear-all-images"
                >
                  <i className="fas fa-trash mr-1"></i>Clear All Images
                </button>
              </div>
            )}
          </div>
          {form.formState.errors.images && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.images.message}</p>
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
