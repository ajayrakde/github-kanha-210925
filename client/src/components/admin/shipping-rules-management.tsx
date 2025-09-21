import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import QueryBuilder from "@/components/admin/query-builder";
import type { ShippingRule, ProductQueryConditions, LocationQueryConditions } from "@shared/schema";

type ShippingRuleType = "product_query_based" | "location_query_based";
type ShippingRuleConditions = ProductQueryConditions | LocationQueryConditions;
type QueryRule = ProductQueryConditions["rules"][number] | LocationQueryConditions["rules"][number];

interface ShippingRuleFormData {
  name: string;
  description: string;
  type: ShippingRuleType;
  shippingCharge: string;
  isEnabled: boolean;
  priority: number;
  conditions: ShippingRuleConditions;
}

const PRODUCT_FIELDS = new Set<string>([
  "productName",
  "category",
  "classification",
]);

const LOCATION_FIELDS = new Set<string>([
  "pincode",
  "orderValue",
]);

const VALID_OPERATORS = new Set<string>([
  "EQUALS",
  "NOT_EQUALS",
  "IN",
  "NOT_IN",
  "BETWEEN",
  "NOT_BETWEEN",
  "GREATER_THAN",
  "LESS_THAN",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS",
]);

const SINGLE_VALUE_OPERATORS = new Set<string>([
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS",
]);

const DOUBLE_VALUE_OPERATORS = new Set<string>(["BETWEEN", "NOT_BETWEEN"]);

const createDefaultProductConditions = (): ProductQueryConditions => ({
  rules: [{ field: "productName", operator: "EQUALS", values: [""] }],
  logicalOperator: "AND",
});

const createDefaultLocationConditions = (): LocationQueryConditions => ({
  rules: [{ field: "pincode", operator: "EQUALS", values: [""] }],
  logicalOperator: "AND",
});

const getDefaultConditions = (type: ShippingRuleType): ShippingRuleConditions =>
  type === "product_query_based"
    ? createDefaultProductConditions()
    : createDefaultLocationConditions();

const sanitizeConditions = (
  type: ShippingRuleType,
  rawConditions: any
): ShippingRuleConditions => {
  if (!rawConditions || !Array.isArray(rawConditions.rules)) {
    return getDefaultConditions(type);
  }

  const logicalOperator = rawConditions.logicalOperator === "OR" ? "OR" : "AND";
  const allowedFieldSet = type === "product_query_based" ? PRODUCT_FIELDS : LOCATION_FIELDS;

  const sanitizedRules = rawConditions.rules
    .map((rule: any) => {
      if (
        !rule ||
        typeof rule.field !== "string" ||
        typeof rule.operator !== "string" ||
        !Array.isArray(rule.values)
      ) {
        return null;
      }

      const field = rule.field;
      const operator = rule.operator;

      if (!allowedFieldSet.has(field) || !VALID_OPERATORS.has(operator)) {
        return null;
      }

      const values = rule.values.map((value: any) => String(value ?? ""));

      if (DOUBLE_VALUE_OPERATORS.has(operator) && values.length !== 2) {
        return null;
      }

      if (SINGLE_VALUE_OPERATORS.has(operator) && values.length !== 1) {
        return null;
      }

      if (
        !SINGLE_VALUE_OPERATORS.has(operator) &&
        !DOUBLE_VALUE_OPERATORS.has(operator) &&
        values.length === 0
      ) {
        return null;
      }

      return {
        field,
        operator,
        values,
      } as QueryRule;
    })
    .filter((rule: QueryRule | null): rule is QueryRule => rule !== null);

  if (sanitizedRules.length === 0) {
    return getDefaultConditions(type);
  }

  return {
    rules: sanitizedRules as ShippingRuleConditions["rules"],
    logicalOperator,
  } as ShippingRuleConditions;
};

const mapRuleType = (type: string): ShippingRuleType => {
  if (type === "location_query_based" || type === "location_value_based") {
    return "location_query_based";
  }
  return "product_query_based";
};

const createDefaultFormData = (): ShippingRuleFormData => ({
  name: "",
  description: "",
  type: "product_query_based",
  shippingCharge: "0",
  isEnabled: true,
  priority: 0,
  conditions: getDefaultConditions("product_query_based"),
});

export default function ShippingRulesManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ShippingRule | null>(null);
  const [formData, setFormData] = useState<ShippingRuleFormData>(() => createDefaultFormData());

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
    const normalizedType = mapRuleType(rule.type);
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      type: normalizedType,
      shippingCharge: rule.shippingCharge,
      isEnabled: rule.isEnabled ?? true,
      priority: rule.priority ?? 0,
      conditions: sanitizeConditions(normalizedType, rule.conditions)
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
    setFormData(createDefaultFormData());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, updates: formData });
    } else {
      createRuleMutation.mutate(formData);
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
          onClick={() => {
            setEditingRule(null);
            setFormData(createDefaultFormData());
            setShowForm(true);
          }}
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
                        <Badge
                          variant={
                            rule.type === "product_query_based"
                              ? "default"
                              : rule.type === "location_query_based"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {rule.type === "product_query_based"
                            ? "Product Query"
                            : rule.type === "location_query_based"
                            ? "Location Query"
                            : rule.type}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-shipping-rule" className="text-lg font-semibold">
              {editingRule ? "Edit Shipping Rule" : "Create Shipping Rule"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Rule Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter rule name"
                  required
                  data-testid="input-rule-name"
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingCharge" className="text-sm font-medium">Shipping Charge (₹) *</Label>
                <Input
                  id="shippingCharge"
                  type="number"
                  step="0.01"
                  value={formData.shippingCharge}
                  onChange={(e) => setFormData(prev => ({ ...prev, shippingCharge: e.target.value }))}
                  placeholder="0.00"
                  required
                  data-testid="input-shipping-charge"
                  className="w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description of this rule"
                rows={3}
                data-testid="input-description"
                className="w-full resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="type" className="text-sm font-medium">Rule Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => {
                    const nextType = value as ShippingRuleType;
                    setFormData(prev => ({
                      ...prev,
                      type: nextType,
                      conditions: getDefaultConditions(nextType)
                    }));
                  }}
                >
                  <SelectTrigger data-testid="select-rule-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product_query_based">Product Query Builder</SelectItem>
                    <SelectItem value="location_query_based">Location Query Builder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-sm font-medium">Priority</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  data-testid="input-priority"
                  className="w-full"
                />
                <p className="text-xs text-gray-500">Higher values are evaluated first</p>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">Rule Conditions *</Label>
              <p className="text-sm text-gray-600 mb-4">
                {formData.type === "product_query_based"
                  ? "Build SQL-like queries for product matching using operators like IN, NOT IN, BETWEEN, etc."
                  : "Build SQL-like queries for location and order value matching using advanced operators"}
              </p>
              <QueryBuilder
                type={formData.type}
                conditions={
                  formData.type === "product_query_based"
                    ? (formData.conditions as ProductQueryConditions)
                    : (formData.conditions as LocationQueryConditions)
                }
                onChange={(conditions) => setFormData(prev => ({ ...prev, conditions }))}
              />
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