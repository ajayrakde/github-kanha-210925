import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { PaymentProvider, PaymentProviderSettings } from "@shared/schema";
import { CreditCard, Shield, Settings2, Key } from "lucide-react";

interface PaymentProviderWithSettings extends PaymentProvider {
  settings?: PaymentProviderSettings[];
  activeSettings?: PaymentProviderSettings;
}

export default function PaymentProvidersManagement() {
  const { toast } = useToast();
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [selectedMode, setSelectedMode] = useState<'test' | 'live'>('test');

  // Fetch payment providers with settings
  const { data: providers = [], isLoading } = useQuery<PaymentProviderWithSettings[]>({
    queryKey: ['/api/admin/payment-providers'],
  });

  // Provider enable/disable mutation
  const toggleProviderMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string, isEnabled: boolean }) => {
      const response = await fetch(`/api/admin/payment-providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled }),
      });
      if (!response.ok) throw new Error('Failed to update provider');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-providers'] });
      toast({ title: "Success", description: "Payment provider updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update payment provider", variant: "destructive" });
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/admin/payment-provider-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-providers'] });
      toast({ title: "Success", description: "Payment settings updated successfully" });
      setShowSettingsForm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update payment settings", variant: "destructive" });
    }
  });

  const handleProviderToggle = useCallback((provider: PaymentProvider, enabled: boolean) => {
    toggleProviderMutation.mutate({ id: provider.id, isEnabled: enabled });
  }, [toggleProviderMutation]);

  const handleSettingsSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedProvider) return;

    let settings: any = {};
    
    if (selectedProvider.name === 'phonepe') {
      settings = {
        merchantId: formData.get('merchantId') as string,
        saltKey: formData.get('saltKey') as string,
        saltIndex: formData.get('saltIndex') as string,
        webhookUrl: formData.get('webhookUrl') as string,
      };
    } else if (selectedProvider.name === 'stripe') {
      settings = {
        publicKey: formData.get('publicKey') as string,
        secretKey: formData.get('secretKey') as string,
        webhookUrl: formData.get('webhookUrl') as string,
      };
    }

    const data = {
      providerId: selectedProvider.id,
      mode: selectedMode,
      settings,
      isActive: formData.get('isActive') === 'on',
    };

    updateSettingsMutation.mutate(data);
  }, [selectedProvider, selectedMode, updateSettingsMutation]);

  const handleConfigureProvider = useCallback((provider: PaymentProvider) => {
    setSelectedProvider(provider);
    setSelectedMode('test');
    setShowSettingsForm(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">Loading payment providers...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Payment Providers</h2>
        <div className="text-sm text-gray-600">
          Configure payment gateways and credentials
        </div>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Providers Available</h3>
            <p className="text-gray-600">Contact your system administrator to add payment providers.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {providers.map((provider) => {
            const hasTestSettings = provider.settings?.some(s => s.mode === 'test');
            const hasLiveSettings = provider.settings?.some(s => s.mode === 'live');
            const activeSettings = provider.settings?.find(s => s.isActive);
            
            return (
              <Card key={provider.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{provider.displayName}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">{provider.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Switch
                        checked={provider.isEnabled ?? false}
                        onCheckedChange={(checked) => handleProviderToggle(provider, checked)}
                        data-testid={`toggle-${provider.name}`}
                      />
                      <Badge variant={provider.isEnabled ? "default" : "secondary"}>
                        {provider.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Test:</span>
                        <Badge variant={hasTestSettings ? "default" : "outline"} className="text-xs">
                          {hasTestSettings ? "Configured" : "Not Set"}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Key className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">Live:</span>
                        <Badge variant={hasLiveSettings ? "default" : "outline"} className="text-xs">
                          {hasLiveSettings ? "Configured" : "Not Set"}
                        </Badge>
                      </div>
                      {activeSettings && (
                        <div className="flex items-center space-x-1">
                          <Settings2 className="w-4 h-4 text-green-500" />
                          <span className="text-gray-600">Active:</span>
                          <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                            {activeSettings.mode.toUpperCase()}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleConfigureProvider(provider)}
                      size="sm"
                      variant="outline"
                      data-testid={`configure-${provider.name}`}
                    >
                      <Settings2 className="w-4 h-4 mr-2" />
                      Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Settings Configuration Dialog */}
      <Dialog open={showSettingsForm} onOpenChange={setShowSettingsForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Settings2 className="w-5 h-5 mr-2" />
              Configure {selectedProvider?.displayName} Settings
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSettingsSubmit} className="space-y-6">
            {/* Mode Selection */}
            <div className="space-y-2">
              <Label>Environment Mode</Label>
              <Tabs value={selectedMode} onValueChange={(value) => setSelectedMode(value as 'test' | 'live')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="test">Test Mode</TabsTrigger>
                  <TabsTrigger value="live">Live Mode</TabsTrigger>
                </TabsList>
                
                <TabsContent value="test" className="space-y-4 mt-4">
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>Test Mode:</strong> Use sandbox credentials for testing payments without real transactions.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="live" className="space-y-4 mt-4">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">
                      <strong>Live Mode:</strong> Use production credentials for real transactions. Handle with care.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Provider Specific Settings */}
            {selectedProvider?.name === 'phonepe' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="merchantId">Merchant ID</Label>
                    <Input
                      id="merchantId"
                      name="merchantId"
                      placeholder="MERCHANT_ID"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="saltIndex">Salt Index</Label>
                    <Input
                      id="saltIndex"
                      name="saltIndex"
                      placeholder="1"
                      type="number"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="saltKey">Salt Key</Label>
                  <Input
                    id="saltKey"
                    name="saltKey"
                    type="password"
                    placeholder="Salt key for API authentication"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL (Optional)</Label>
                  <Input
                    id="webhookUrl"
                    name="webhookUrl"
                    type="url"
                    placeholder={`${window.location.origin}/api/payments/webhook/phonepe`}
                  />
                </div>
              </div>
            )}

            {/* Stripe Specific Settings */}
            {selectedProvider?.name === 'stripe' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publicKey">Publishable Key (Client ID)</Label>
                    <Input
                      id="publicKey"
                      name="publicKey"
                      placeholder={selectedMode === 'test' ? "pk_test_..." : "pk_live_..."}
                      required
                    />
                    <p className="text-xs text-gray-500">
                      Get from Stripe Dashboard → API Keys → Publishable key
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      name="secretKey"
                      type="password"
                      placeholder={selectedMode === 'test' ? "sk_test_..." : "sk_live_..."}
                      required
                    />
                    <p className="text-xs text-gray-500">
                      Get from Stripe Dashboard → API Keys → Secret key
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Webhook URL (Optional)</Label>
                  <Input
                    id="webhookUrl"
                    name="webhookUrl"
                    type="url"
                    placeholder={`${window.location.origin}/api/payments/webhook/stripe`}
                  />
                  <p className="text-xs text-gray-500">
                    Configure in Stripe Dashboard → Webhooks
                  </p>
                </div>
              </div>
            )}

            {/* Active Configuration */}
            <div className="flex items-center space-x-2 p-4 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="isActive"
                name="isActive"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <Label htmlFor="isActive" className="text-sm font-medium">
                Set this configuration as active for {selectedMode} mode
              </Label>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSettingsForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                data-testid="save-provider-settings"
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}