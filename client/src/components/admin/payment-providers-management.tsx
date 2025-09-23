import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { PaymentProvider, PaymentProviderSettings } from "@shared/schema";
import { CreditCard, Shield, Settings2, Plus, Edit2, Key } from "lucide-react";

interface PaymentProviderWithSettings extends PaymentProvider {
  settings?: PaymentProviderSettings[];
}

export default function PaymentProvidersManagement() {
  const { toast } = useToast();
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showSettingsForm, setShowSettingsForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<PaymentProvider | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [selectedMode, setSelectedMode] = useState<'test' | 'live'>('test');

  // Fetch payment providers with settings
  const { data: providers = [], isLoading } = useQuery<PaymentProviderWithSettings[]>({
    queryKey: ['/api/admin/payment-providers'],
  });

  // Provider mutations
  const createProviderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/admin/payment-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create provider');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-providers'] });
      toast({ title: "Success", description: "Payment provider created successfully" });
      setShowProviderForm(false);
      setEditingProvider(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create payment provider", variant: "destructive" });
    }
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const response = await fetch(`/api/admin/payment-providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update provider');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-providers'] });
      toast({ title: "Success", description: "Payment provider updated successfully" });
      setShowProviderForm(false);
      setEditingProvider(null);
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

  const handleProviderSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      displayName: formData.get('displayName') as string,
      description: formData.get('description') as string,
      isEnabled: formData.get('isEnabled') === 'on',
      isDefault: formData.get('isDefault') === 'on',
      priority: parseInt(formData.get('priority') as string) || 0,
    };

    if (editingProvider) {
      updateProviderMutation.mutate({ id: editingProvider.id, data });
    } else {
      createProviderMutation.mutate(data);
    }
  }, [editingProvider, createProviderMutation, updateProviderMutation]);

  const handleSettingsSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedProvider) return;

    const settings = {
      clientId: formData.get('clientId') as string,
      clientSecret: formData.get('clientSecret') as string,
      clientVersion: formData.get('clientVersion') as string,
      merchantId: formData.get('merchantId') as string,
      webhookUrl: formData.get('webhookUrl') as string,
    };

    const data = {
      providerId: selectedProvider.id,
      mode: selectedMode,
      settings,
      isActive: formData.get('isActive') === 'on',
    };

    updateSettingsMutation.mutate(data);
  }, [selectedProvider, selectedMode, updateSettingsMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Payment Gateway Management</h3>
          <p className="text-sm text-gray-600 mt-1">Configure payment providers and manage credentials</p>
        </div>
        <Button 
          onClick={() => setShowProviderForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-add-provider"
        >
          <Plus size={16} className="mr-2" />
          Add Provider
        </Button>
      </div>

      {/* Provider Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const providerWithSettings = provider as PaymentProviderWithSettings;
          const testSettings = providerWithSettings.settings?.find((s: PaymentProviderSettings) => s.mode === 'test' && s.isActive);
          const liveSettings = providerWithSettings.settings?.find((s: PaymentProviderSettings) => s.mode === 'live' && s.isActive);
          
          return (
            <Card key={provider.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center">
                    <CreditCard size={20} className="mr-2 text-blue-600" />
                    {provider.displayName}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={provider.isEnabled ? "default" : "secondary"}>
                      {provider.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    {provider.isDefault && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Default
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <p className="text-sm text-gray-600 mb-4">{provider.description}</p>
                
                {/* Configuration Status */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm">
                    <Shield size={14} className="mr-2" />
                    <span className="text-gray-600">Test Mode:</span>
                    <Badge 
                      variant={testSettings ? "default" : "outline"}
                      className="ml-2 text-xs"
                    >
                      {testSettings ? "Configured" : "Not Configured"}
                    </Badge>
                  </div>
                  <div className="flex items-center text-sm">
                    <Shield size={14} className="mr-2" />
                    <span className="text-gray-600">Live Mode:</span>
                    <Badge 
                      variant={liveSettings ? "default" : "outline"}
                      className="ml-2 text-xs"
                    >
                      {liveSettings ? "Configured" : "Not Configured"}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingProvider(provider);
                      setShowProviderForm(true);
                    }}
                    data-testid={`button-edit-provider-${provider.id}`}
                  >
                    <Edit2 size={14} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedProvider(provider);
                      setShowSettingsForm(true);
                    }}
                    data-testid={`button-settings-provider-${provider.id}`}
                  >
                    <Key size={14} className="mr-1" />
                    Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {providers.length === 0 && (
          <div className="col-span-full">
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
              <div className="text-gray-600 font-medium">No Payment Providers Configured</div>
              <div className="text-sm text-gray-500 mt-2">Add your first payment provider to start accepting payments</div>
              <Button 
                onClick={() => setShowProviderForm(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus size={16} className="mr-2" />
                Add Payment Provider
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Provider Form Dialog */}
      <Dialog open={showProviderForm} onOpenChange={setShowProviderForm}>
        <DialogContent className="max-w-md" aria-describedby="provider-form-description">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? 'Edit Payment Provider' : 'Add Payment Provider'}
            </DialogTitle>
          </DialogHeader>
          <div id="provider-form-description" className="sr-only">
            Form to add or edit payment provider information
          </div>
          
          <form onSubmit={handleProviderSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Provider Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. phonepe"
                defaultValue={editingProvider?.name}
                required
                data-testid="input-provider-name"
              />
            </div>
            
            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                name="displayName"
                placeholder="e.g. PhonePe"
                defaultValue={editingProvider?.displayName}
                required
                data-testid="input-provider-display-name"
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief description of the payment provider"
                defaultValue={editingProvider?.description || ''}
                data-testid="input-provider-description"
              />
            </div>
            
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                name="priority"
                type="number"
                placeholder="0"
                defaultValue={editingProvider?.priority || 0}
                data-testid="input-provider-priority"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="isEnabled" 
                name="isEnabled"
                defaultChecked={editingProvider?.isEnabled !== false}
                data-testid="switch-provider-enabled"
              />
              <Label htmlFor="isEnabled">Enabled</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="isDefault" 
                name="isDefault"
                defaultChecked={editingProvider?.isDefault || false}
                data-testid="switch-provider-default"
              />
              <Label htmlFor="isDefault">Set as Default</Label>
            </div>
            
            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowProviderForm(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createProviderMutation.isPending || updateProviderMutation.isPending}
                data-testid="button-save-provider"
              >
                {createProviderMutation.isPending || updateProviderMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settings Form Dialog */}
      <Dialog open={showSettingsForm} onOpenChange={setShowSettingsForm}>
        <DialogContent className="max-w-2xl" aria-describedby="settings-form-description">
          <DialogHeader>
            <DialogTitle>
              Configure {selectedProvider?.displayName} Settings
            </DialogTitle>
          </DialogHeader>
          <div id="settings-form-description" className="sr-only">
            Form to configure payment provider credentials and settings
          </div>
          
          <Tabs value={selectedMode} onValueChange={(value) => setSelectedMode(value as 'test' | 'live')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="test">Test Mode</TabsTrigger>
              <TabsTrigger value="live">Live Mode</TabsTrigger>
            </TabsList>
            
            <TabsContent value="test" className="mt-4">
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Test Mode:</strong> Use test credentials provided by the payment provider. No real transactions will be processed.
                </p>
              </div>
              {selectedProvider?.name === 'phonepe' && (
                <PhonePeSettingsForm 
                  provider={selectedProvider} 
                  mode="test" 
                  onSubmit={handleSettingsSubmit}
                  isPending={updateSettingsMutation.isPending}
                />
              )}
            </TabsContent>
            
            <TabsContent value="live" className="mt-4">
              <div className="bg-red-50 border border-red-200 p-3 rounded-lg mb-4">
                <p className="text-sm text-red-800">
                  <strong>Live Mode:</strong> Use production credentials. Real transactions will be processed and charged.
                </p>
              </div>
              {selectedProvider?.name === 'phonepe' && (
                <PhonePeSettingsForm 
                  provider={selectedProvider} 
                  mode="live" 
                  onSubmit={handleSettingsSubmit}
                  isPending={updateSettingsMutation.isPending}
                />
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// PhonePe-specific settings form
function PhonePeSettingsForm({ 
  provider, 
  mode, 
  onSubmit, 
  isPending 
}: { 
  provider: PaymentProvider; 
  mode: 'test' | 'live'; 
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
}) {
  const providerWithSettings = provider as PaymentProviderWithSettings;
  const settings = providerWithSettings.settings?.find((s: PaymentProviderSettings) => s.mode === mode);
  const currentSettings = settings?.settings as any || {};

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="clientId">Client ID</Label>
        <Input
          id="clientId"
          name="clientId"
          placeholder="Enter PhonePe Client ID"
          defaultValue={currentSettings.clientId || ''}
          required
          data-testid={`input-${mode}-client-id`}
        />
      </div>
      
      <div>
        <Label htmlFor="clientSecret">Client Secret</Label>
        <Input
          id="clientSecret"
          name="clientSecret"
          type="password"
          placeholder="Enter PhonePe Client Secret"
          defaultValue={currentSettings.clientSecret || ''}
          required
          data-testid={`input-${mode}-client-secret`}
        />
      </div>
      
      <div>
        <Label htmlFor="clientVersion">Client Version</Label>
        <Input
          id="clientVersion"
          name="clientVersion"
          placeholder="Enter PhonePe Client Version"
          defaultValue={currentSettings.clientVersion || ''}
          required
          data-testid={`input-${mode}-client-version`}
        />
      </div>
      
      <div>
        <Label htmlFor="merchantId">Merchant ID</Label>
        <Input
          id="merchantId"
          name="merchantId"
          placeholder="Enter PhonePe Merchant ID"
          defaultValue={currentSettings.merchantId || ''}
          data-testid={`input-${mode}-merchant-id`}
        />
      </div>
      
      <div>
        <Label htmlFor="webhookUrl">Webhook URL</Label>
        <Input
          id="webhookUrl"
          name="webhookUrl"
          placeholder="https://yoursite.com/api/webhooks/phonepe"
          defaultValue={currentSettings.webhookUrl || ''}
          data-testid={`input-${mode}-webhook-url`}
        />
        <p className="text-sm text-gray-500 mt-1">
          URL where PhonePe will send payment status updates
        </p>
      </div>
      
      <div className="flex items-center space-x-2">
        <Switch 
          id="isActive" 
          name="isActive"
          defaultChecked={settings?.isActive || false}
          data-testid={`switch-${mode}-active`}
        />
        <Label htmlFor="isActive">Activate {mode} mode settings</Label>
      </div>
      
      <div className="flex gap-2 justify-end pt-4">
        <Button type="submit" disabled={isPending} data-testid={`button-save-${mode}-settings`}>
          {isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </form>
  );
}