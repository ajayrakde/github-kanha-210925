import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { ShippingRule } from "@shared/schema";

interface ShippingRuleFormData {
  name: string;
  description: string;
  type: "product_based" | "location_value_based";
  shippingCharge: string;
  isEnabled: boolean;
  priority: number;
  conditions: any;
}

export default function ShippingRulesManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ShippingRule | null>(null);
  const [formData, setFormData] = useState<ShippingRuleFormData>({
    name: "",
    description: "",
    type: "product_based",
    shippingCharge: "0",
    isEnabled: true,
    priority: 0,
    conditions: {}
  });

  // Fetch shipping rules
  const { data: shippingRules = [], isLoading } = useQuery<ShippingRule[]>({
    queryKey: ["/api/admin/shipping-rules"],
  });

  // Create shipping rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (ruleData: ShippingRuleFormData) => {
      const response = await apiRequest("POST", "/api/admin/shipping-rules", ruleData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipping-rules"] });
      toast({
        title: "Success",
        description: "Shipping rule created successfully",
      });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.details ? error.details.map((d: any) => d.message).join(", ") : "Failed to create shipping rule",
        variant: "destructive",
      });
    },
  });

  // Update shipping rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ShippingRuleFormData> }) => {
      const response = await apiRequest("PATCH", `/api/admin/shipping-rules/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipping-rules"] });
      toast({
        title: "Success",
        description: "Shipping rule updated successfully",
      });
      handleCloseForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.details ? error.details.map((d: any) => d.message).join(", ") : "Failed to update shipping rule",
        variant: "destructive",
      });
    },
  });

  // Delete shipping rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/shipping-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shipping-rules"] });
      toast({
        title: "Success",
        description: "Shipping rule deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to delete shipping rule",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (rule: ShippingRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      type: rule.type as "product_based" | "location_value_based",
      shippingCharge: rule.shippingCharge,
      isEnabled: rule.isEnabled ?? true,
      priority: rule.priority ?? 0,
      conditions: rule.conditions
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this shipping rule?")) {
      deleteRuleMutation.mutate(id);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormData({
      name: "",
      description: "",
      type: "product_based",
      shippingCharge: "0",
      isEnabled: true,
      priority: 0,
      conditions: {}
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, updates: formData });
    } else {
      createRuleMutation.mutate(formData);
    }
  };

  const updateConditions = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      conditions: {
        ...prev.conditions,
        [field]: value
      }
    }));
  };

  const renderConditionsForm = () => {
    if (formData.type === "product_based") {
      return (
        <div className="space-y-4">
          <div>
            <Label>Product Names (comma-separated)</Label>
            <Input
              value={formData.conditions.productNames?.join(", ") || ""}
              onChange={(e) => updateConditions("productNames", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="Product1, Product2, Product3"
              data-testid="input-product-names"
            />
          </div>
          <div>
            <Label>Categories (comma-separated)</Label>
            <Input
              value={formData.conditions.categories?.join(", ") || ""}
              onChange={(e) => updateConditions("categories", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="Category1, Category2, Category3"
              data-testid="input-categories"
            />
          </div>
          <div>
            <Label>Classifications (comma-separated)</Label>
            <Input
              value={formData.conditions.classifications?.join(", ") || ""}
              onChange={(e) => updateConditions("classifications", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="Class1, Class2, Class3"
              data-testid="input-classifications"
            />
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-4">
          <div>
            <Label>PIN Codes (comma-separated)</Label>
            <Input
              value={formData.conditions.pincodes?.join(", ") || ""}
              onChange={(e) => updateConditions("pincodes", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
              placeholder="110001, 110002, 110003"
              data-testid="input-pincodes"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Min Order Value (₹)</Label>
              <Input
                type="number"
                value={formData.conditions.minOrderValue || ""}
                onChange={(e) => updateConditions("minOrderValue", e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="500"
                data-testid="input-min-order-value"
              />
            </div>
            <div>
              <Label>Max Order Value (₹)</Label>
              <Input
                type="number"
                value={formData.conditions.maxOrderValue || ""}
                onChange={(e) => updateConditions("maxOrderValue", e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="1000"
                data-testid="input-max-order-value"
              />
            </div>
          </div>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading shipping rules...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Shipping Rules</h2>
          <p className="text-gray-600">Manage shipping charges based on products, locations, and order values</p>
        </div>
        <Button 
          onClick={() => setShowForm(true)}
          data-testid="button-create-shipping-rule"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <i className="fas fa-plus mr-2"></i>
          Create Rule
        </Button>
      </div>

      <Separator />

      {/* Rules Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">Rule Name</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th className="text-left p-4 font-medium">Shipping Charge</th>
                  <th className="text-left p-4 font-medium">Priority</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shippingRules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-gray-500">
                      No shipping rules found. Create your first rule to get started.
                    </td>
                  </tr>
                ) : (
                  shippingRules.map((rule) => (
                    <tr key={rule.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <div>
                          <div className="font-medium" data-testid={`rule-name-${rule.id}`}>
                            {rule.name}
                          </div>
                          {rule.description && (
                            <div className="text-sm text-gray-600 mt-1">
                              {rule.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={rule.type === "product_based" ? "default" : "secondary"}>
                          {rule.type === "product_based" ? "Product Based" : "Location/Value Based"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span className="font-medium">₹{rule.shippingCharge}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {rule.priority}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge variant={rule.isEnabled ? "default" : "secondary"}>
                          {rule.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(rule)}
                            data-testid={`button-edit-${rule.id}`}
                          >
                            <i className="fas fa-edit"></i>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(rule.id)}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`button-delete-${rule.id}`}
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-shipping-rule">
              {editingRule ? "Edit Shipping Rule" : "Create Shipping Rule"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Rule Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter rule name"
                  required
                  data-testid="input-rule-name"
                />
              </div>
              <div>
                <Label htmlFor="shippingCharge">Shipping Charge (₹) *</Label>
                <Input
                  id="shippingCharge"
                  type="number"
                  step="0.01"
                  value={formData.shippingCharge}
                  onChange={(e) => setFormData(prev => ({ ...prev, shippingCharge: e.target.value }))}
                  placeholder="0.00"
                  required
                  data-testid="input-shipping-charge"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description of this rule"
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Rule Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: "product_based" | "location_value_based") => 
                    setFormData(prev => ({ ...prev, type: value, conditions: {} }))
                  }
                >
                  <SelectTrigger data-testid="select-rule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product_based">Product Based</SelectItem>
                    <SelectItem value="location_value_based">Location/Value Based</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  data-testid="input-priority"
                />
                <p className="text-xs text-gray-500 mt-1">Higher values are evaluated first</p>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">Rule Conditions *</Label>
              <p className="text-sm text-gray-600 mb-4">
                {formData.type === "product_based" 
                  ? "Specify at least one condition: product names, categories, or classifications"
                  : "Specify at least one condition: PIN codes or order value range"
                }
              </p>
              {renderConditionsForm()}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isEnabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isEnabled: checked }))}
                data-testid="switch-is-enabled"
              />
              <Label htmlFor="isEnabled">Enable this rule</Label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCloseForm}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                data-testid="button-save-rule"
              >
                {createRuleMutation.isPending || updateRuleMutation.isPending ? "Saving..." : 
                 editingRule ? "Update Rule" : "Create Rule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}