import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
                  
                  {setting.key === 'sms_service_provider' && (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                        {setting.value}
                      </span>
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