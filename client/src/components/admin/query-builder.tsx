import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { QueryOperator, ProductQueryField, LocationQueryField, ProductQueryRule, LocationQueryRule, ProductQueryConditions, LocationQueryConditions } from "@shared/schema";

interface QueryBuilderProps {
  type: "product_query_based" | "location_query_based";
  conditions: ProductQueryConditions | LocationQueryConditions;
  onChange: (conditions: ProductQueryConditions | LocationQueryConditions) => void;
}

type QueryRule = ProductQueryRule | LocationQueryRule;

const productFields: ProductQueryField[] = ["productName", "category", "classification"];
const locationFields: LocationQueryField[] = ["pincode", "orderValue"];

const operators: QueryOperator[] = ["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "BETWEEN", "NOT_BETWEEN"];

const operatorLabels: Record<QueryOperator, string> = {
  "EQUALS": "equals",
  "NOT_EQUALS": "does not equal",
  "IN": "is in",
  "NOT_IN": "is not in",
  "BETWEEN": "is between",
  "NOT_BETWEEN": "is not between",
};

const fieldLabels: Record<string, string> = {
  "productName": "Product Name",
  "category": "Category",
  "classification": "Classification",
  "pincode": "PIN Code",
  "orderValue": "Order Value"
};

export default function QueryBuilder({ type, conditions, onChange }: QueryBuilderProps) {
  const availableFields = type === "product_query_based" ? productFields : locationFields;

  const createEmptyRule = (): QueryRule => ({
    field: availableFields[0],
    operator: "EQUALS",
    values: [""]
  });

  const updateRule = (index: number, updatedRule: Partial<QueryRule>) => {
    const newRules = [...conditions.rules] as any[];
    newRules[index] = { ...newRules[index], ...updatedRule };
    
    // Reset values when operator changes
    if (updatedRule.operator) {
      if (["BETWEEN", "NOT_BETWEEN"].includes(updatedRule.operator)) {
        newRules[index].values = ["", ""];
      } else if (["EQUALS", "NOT_EQUALS"].includes(updatedRule.operator)) {
        newRules[index].values = [""];
      } else {
        // For IN/NOT_IN, keep existing values or start with one empty value
        if (newRules[index].values.length === 0) {
          newRules[index].values = [""];
        }
      }
    }

    onChange({
      ...conditions,
      rules: newRules
    } as any);
  };

  const addRule = () => {
    onChange({
      ...conditions,
      rules: [...conditions.rules, createEmptyRule()]
    } as any);
  };

  const removeRule = (index: number) => {
    if (conditions.rules.length > 1) {
      const newRules = conditions.rules.filter((_: any, i: number) => i !== index);
      onChange({
        ...conditions,
        rules: newRules
      } as any);
    }
  };

  const updateValues = (ruleIndex: number, valueIndex: number, value: string) => {
    const newRules = [...conditions.rules] as any[];
    const newValues = [...newRules[ruleIndex].values];
    newValues[valueIndex] = value;
    newRules[ruleIndex] = { ...newRules[ruleIndex], values: newValues };
    
    onChange({
      ...conditions,
      rules: newRules
    } as any);
  };

  const addValue = (ruleIndex: number) => {
    const newRules = [...conditions.rules] as any[];
    const rule = newRules[ruleIndex];
    if (["IN", "NOT_IN"].includes(rule.operator)) {
      newRules[ruleIndex] = { 
        ...rule, 
        values: [...rule.values, ""] 
      };
      onChange({
        ...conditions,
        rules: newRules
      } as any);
    }
  };

  const removeValue = (ruleIndex: number, valueIndex: number) => {
    const newRules = [...conditions.rules] as any[];
    const rule = newRules[ruleIndex];
    if (rule.values.length > 1) {
      const newValues = rule.values.filter((_: any, i: number) => i !== valueIndex);
      newRules[ruleIndex] = { ...rule, values: newValues };
      onChange({
        ...conditions,
        rules: newRules
      } as any);
    }
  };

  const renderValueInputs = (rule: QueryRule, ruleIndex: number) => {
    const { operator, values, field } = rule;
    
    if (["BETWEEN", "NOT_BETWEEN"].includes(operator)) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              value={values[0] || ""}
              onChange={(e) => updateValues(ruleIndex, 0, e.target.value)}
              placeholder={field === "orderValue" ? "100" : field === "pincode" ? "110001" : "Value 1"}
              type={field === "orderValue" ? "number" : "text"}
              data-testid={`input-value-from-${ruleIndex}`}
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              value={values[1] || ""}
              onChange={(e) => updateValues(ruleIndex, 1, e.target.value)}
              placeholder={field === "orderValue" ? "500" : field === "pincode" ? "110010" : "Value 2"}
              type={field === "orderValue" ? "number" : "text"}
              data-testid={`input-value-to-${ruleIndex}`}
            />
          </div>
        </div>
      );
    }

    if (["EQUALS", "NOT_EQUALS"].includes(operator)) {
      return (
        <Input
          value={values[0] || ""}
          onChange={(e) => updateValues(ruleIndex, 0, e.target.value)}
          placeholder={field === "orderValue" ? "100" : field === "pincode" ? "110001" : "Enter value"}
          type={field === "orderValue" ? "number" : "text"}
          data-testid={`input-value-${ruleIndex}`}
        />
      );
    }

    // For IN and NOT_IN operators
    return (
      <div className="space-y-2">
        {values.map((value, valueIndex) => (
          <div key={valueIndex} className="flex gap-2 items-center">
            <Input
              value={value}
              onChange={(e) => updateValues(ruleIndex, valueIndex, e.target.value)}
              placeholder={field === "orderValue" ? "100" : field === "pincode" ? "110001" : `Value ${valueIndex + 1}`}
              type={field === "orderValue" ? "number" : "text"}
              className="flex-1"
              data-testid={`input-value-${ruleIndex}-${valueIndex}`}
            />
            {values.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => removeValue(ruleIndex, valueIndex)}
                className="text-red-600 hover:text-red-700"
                data-testid={`button-remove-value-${ruleIndex}-${valueIndex}`}
              >
                <i className="fas fa-times text-sm"></i>
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addValue(ruleIndex)}
          data-testid={`button-add-value-${ruleIndex}`}
        >
          <i className="fas fa-plus mr-2"></i>Add Value
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Query Builder</Label>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Logic:</Label>
          <Select
            value={conditions.logicalOperator}
            onValueChange={(value: "AND" | "OR") => onChange({ ...conditions, logicalOperator: value })}
          >
            <SelectTrigger className="w-20" data-testid="select-logical-operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">AND</SelectItem>
              <SelectItem value="OR">OR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {conditions.rules.map((rule, index) => (
          <Card key={index} className="relative">
            <CardContent className="p-4">
              {index > 0 && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-white px-2 text-xs font-medium text-gray-500 border rounded">
                  {conditions.logicalOperator}
                </div>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Field</Label>
                  <Select
                    value={rule.field}
                    onValueChange={(value) => updateRule(index, { field: value as any })}
                  >
                    <SelectTrigger data-testid={`select-field-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map((field) => (
                        <SelectItem key={field} value={field}>
                          {fieldLabels[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Operator</Label>
                  <Select
                    value={rule.operator}
                    onValueChange={(value: QueryOperator) => updateRule(index, { operator: value })}
                  >
                    <SelectTrigger data-testid={`select-operator-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operators.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {operatorLabels[operator]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="lg:col-span-1">
                  <Label className="text-xs">Values</Label>
                  {renderValueInputs(rule, index)}
                </div>
              </div>

              {conditions.rules.length > 1 && (
                <div className="absolute top-2 right-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeRule(index)}
                    className="text-red-600 hover:text-red-700"
                    data-testid={`button-remove-rule-${index}`}
                  >
                    <i className="fas fa-trash text-sm"></i>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addRule}
        className="w-full"
        data-testid="button-add-rule"
      >
        <i className="fas fa-plus mr-2"></i>Add Rule
      </Button>

      <Separator />
      
      <div className="text-sm text-gray-600 space-y-1">
        <div className="font-medium">Query Preview:</div>
        <div className="bg-gray-50 p-3 rounded text-xs font-mono">
          {conditions.rules.map((rule, index) => (
            <span key={index}>
              {index > 0 && ` ${conditions.logicalOperator} `}
              <span className="text-blue-600">{fieldLabels[rule.field]}</span>{" "}
              <span className="text-purple-600">{operatorLabels[rule.operator]}</span>{" "}
              {["BETWEEN", "NOT_BETWEEN"].includes(rule.operator) ? (
                <span className="text-green-600">
                  {rule.values[0] || "?"} AND {rule.values[1] || "?"}
                </span>
              ) : ["IN", "NOT_IN"].includes(rule.operator) ? (
                <span className="text-green-600">
                  ({rule.values.filter(v => v).join(", ") || "?"})
                </span>
              ) : (
                <span className="text-green-600">{rule.values[0] || "?"}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}