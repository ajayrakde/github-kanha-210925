import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface AppSetting {
  id: string;
  key: string;
  value: string;
  description: string;
  category: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function SettingsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch app settings
  const { data: settings, isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/settings/${key}`, { value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Setting Updated",
        description: "App setting has been successfully updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
    },
  });

  const handleToggleSetting = (key: string, currentValue: string) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    updateSettingMutation.mutate({ key, value: newValue });
  };

  const handleUpdateValue = (key: string, value: string) => {
    updateSettingMutation.mutate({ key, value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading settings...</div>
      </div>
    );
  }

  const authSettings = settings?.filter(s => s.category === 'authentication') || [];
  const shippingSettings = settings?.filter(s => s.category === 'shipping') || [];
  const generalSettings = settings?.filter(s => s.category === 'general') || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">App Settings</h2>
        <p className="text-gray-600">Manage application configuration and features</p>
      </div>

      <Separator />

      {/* Authentication Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-lock text-blue-600"></i>
            Authentication & OTP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {authSettings.map((setting) => (
            <div key={setting.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="font-medium">
                    {setting.key === 'otp_login_enabled' && '🔐 OTP Login for Customers'}
                    {setting.key === 'sms_service_provider' && '📱 SMS Service Provider'}
                    {setting.key === 'otp_expiry_minutes' && '⏰ OTP Expiry Time'}
                    {setting.key === 'otp_length' && '🔢 OTP Length'}
                  </Label>
                  <p className="text-sm text-gray-600">{setting.description}</p>
                  {setting.updatedBy && (
                    <p className="text-xs text-gray-400">
                      Last updated by {setting.updatedBy} on {new Date(setting.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {setting.key === 'otp_login_enabled' && (
                    <Switch
                      checked={setting.value === 'true'}
                      onCheckedChange={() => handleToggleSetting(setting.key, setting.value)}
                      disabled={updateSettingMutation.isPending}
                      data-testid={`switch-${setting.key}`}
                    />
                  )}
                  
                  {setting.key === 'otp_expiry_minutes' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={setting.value}
                        onChange={(e) => handleUpdateValue(setting.key, e.target.value)}
                        className="w-20"
                        min="1"
                        max="30"
                        disabled={updateSettingMutation.isPending}
                        data-testid={`input-${setting.key}`}
                      />
                      <span className="text-sm text-gray-600">minutes</span>
                    </div>
                  )}
                  
                  {setting.key === 'otp_length' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={setting.value}
                        onChange={(e) => handleUpdateValue(setting.key, e.target.value)}
                        className="w-16"
                        min="4"
                        max="8"
                        disabled={updateSettingMutation.isPending}
                        data-testid={`input-${setting.key}`}
                      />
                      <span className="text-sm text-gray-600">digits</span>
                    </div>
                  )}
                  
                  {setting.key === 'sms_service_provider' && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={setting.value}
                        onValueChange={(value) => handleUpdateValue(setting.key, value)}
                        disabled={updateSettingMutation.isPending}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-${setting.key}`}>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Test">Test (Mock)</SelectItem>
                          <SelectItem value="2Factor">2Factor API</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              
              {setting.key === 'otp_login_enabled' && (
                <div className={`p-3 rounded-lg ${setting.value === 'true' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className={`text-sm ${setting.value === 'true' ? 'text-green-700' : 'text-red-700'}`}>
                    {setting.value === 'true' 
                      ? '✅ Customers can login using OTP verification during checkout'
                      : '❌ OTP login is disabled - customers cannot complete purchases'
                    }
                  </p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Shipping Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-truck text-green-600"></i>
            Shipping Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {shippingSettings.map((setting) => (
            <div key={setting.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="font-medium">
                    {setting.key === 'default_shipping_charge' && '💰 Default Shipping Charge'}
                  </Label>
                  <p className="text-sm text-gray-600">{setting.description}</p>
                  {setting.updatedBy && (
                    <p className="text-xs text-gray-400">
                      Last updated by {setting.updatedBy} on {new Date(setting.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {setting.key === 'default_shipping_charge' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">₹</span>
                      <Input
                        type="number"
                        value={setting.value}
                        onChange={(e) => handleUpdateValue(setting.key, e.target.value)}
                        className="w-24"
                        min="0"
                        step="0.01"
                        disabled={updateSettingMutation.isPending}
                        data-testid={`input-${setting.key}`}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {setting.key === 'default_shipping_charge' && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm text-green-700">
                    💡 This charge applies when no shipping rules match the order. Use the <strong>Shipping Rules</strong> tab to create specific conditions.
                  </p>
                </div>
              )}
            </div>
          ))}
          
          {shippingSettings.length === 0 && (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                <i className="fas fa-truck text-gray-400 text-xl"></i>
              </div>
              <div className="text-gray-600 font-medium">No Shipping Settings Found</div>
              <div className="text-sm text-gray-500 mt-1">Default shipping settings will be initialized automatically.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* General Settings */}
      {generalSettings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <i className="fas fa-cog text-gray-600"></i>
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {generalSettings.map((setting) => (
              <div key={setting.id} className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">{setting.key}</Label>
                  <p className="text-sm text-gray-600">{setting.description}</p>
                </div>
                <Input
                  value={setting.value}
                  onChange={(e) => handleUpdateValue(setting.key, e.target.value)}
                  className="w-32"
                  disabled={updateSettingMutation.isPending}
                  data-testid={`input-${setting.key}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Information Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <i className="fas fa-info-circle text-blue-600 mt-1"></i>
            <div>
              <h4 className="font-medium text-blue-900">Important Notes</h4>
              <ul className="mt-2 text-sm text-blue-800 space-y-1">
                <li>• Disabling OTP login will prevent new customer registrations and logins</li>
                <li>• SMS service is powered by 2Factor API for reliable delivery</li>
                <li>• OTP expiry time affects user experience - too short may cause frustration</li>
                <li>• Changes take effect immediately across the application</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}