import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  Shield, 
  Settings2, 
  Copy, 
  CheckCircle, 
  XCircle,
  Activity,
  Smartphone,
  CreditCard as CardIcon,
  Banknote,
  Wallet,
  RefreshCw,
  ArrowUpDown,
  Coins,
  Globe,
  Webhook
} from "lucide-react";

// Import the capability matrix and types from our shared file
import type { PaymentProviderConfig } from "@shared/schema";

// Payment provider types (matching our new schema)
type PaymentProvider = 'razorpay' | 'payu' | 'ccavenue' | 'cashfree' | 'paytm' | 'billdesk' | 'phonepe' | 'stripe';
type Environment = 'test' | 'live';

// Capability matrix (from TASK 2 specification)
const capabilityMatrix: Record<PaymentProvider, Record<string, boolean>> = {
  razorpay: { cards: true, upi: true, netbanking: true, wallets: true, refunds: true, payouts: true, tokenization: true, international: true, webhooks: true },
  payu: { cards: true, upi: true, netbanking: true, wallets: true, refunds: true, payouts: false, tokenization: true, international: false, webhooks: true },
  ccavenue: { cards: true, upi: true, netbanking: true, wallets: true, refunds: true, payouts: false, tokenization: true, international: true, webhooks: true },
  cashfree: { cards: true, upi: true, netbanking: true, wallets: true, refunds: true, payouts: true, tokenization: true, international: false, webhooks: true },
  paytm: { cards: true, upi: true, netbanking: true, wallets: true, refunds: true, payouts: true, tokenization: false, international: false, webhooks: true },
  billdesk: { cards: true, upi: true, netbanking: true, wallets: false, refunds: true, payouts: false, tokenization: false, international: false, webhooks: true },
  phonepe: { cards: false, upi: true, netbanking: false, wallets: false, refunds: true, payouts: false, tokenization: false, international: false, webhooks: true },
  stripe: { cards: true, upi: false, netbanking: false, wallets: true, refunds: true, payouts: true, tokenization: true, international: true, webhooks: true },
};

// Provider display names
const providerDisplayNames: Record<PaymentProvider, string> = {
  razorpay: 'Razorpay', payu: 'PayU', ccavenue: 'CCAvenue', cashfree: 'Cashfree',
  paytm: 'Paytm', billdesk: 'BillDesk', phonepe: 'PhonePe', stripe: 'Stripe',
};

// Required environment variables (PAYAPP_* pattern from TASK 3)
const providerSecretKeys: Record<PaymentProvider, { test: string[], live: string[] }> = {
  razorpay: {
    test: ['PAYAPP_TEST_RAZORPAY_KEY_SECRET', 'PAYAPP_TEST_RAZORPAY_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_RAZORPAY_KEY_SECRET', 'PAYAPP_LIVE_RAZORPAY_WEBHOOK_SECRET'],
  },
  payu: { test: ['PAYAPP_TEST_PAYU_SALT'], live: ['PAYAPP_LIVE_PAYU_SALT'] },
  ccavenue: { test: ['PAYAPP_TEST_CCAVENUE_WORKING_KEY'], live: ['PAYAPP_LIVE_CCAVENUE_WORKING_KEY'] },
  cashfree: {
    test: ['PAYAPP_TEST_CASHFREE_SECRET_KEY', 'PAYAPP_TEST_CASHFREE_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_CASHFREE_SECRET_KEY', 'PAYAPP_LIVE_CASHFREE_WEBHOOK_SECRET'],
  },
  paytm: { test: ['PAYAPP_TEST_PAYTM_MERCHANT_KEY'], live: ['PAYAPP_LIVE_PAYTM_MERCHANT_KEY'] },
  billdesk: { test: ['PAYAPP_TEST_BILLDESK_CHECKSUM_KEY'], live: ['PAYAPP_LIVE_BILLDESK_CHECKSUM_KEY'] },
  phonepe: {
    test: ['PAYAPP_TEST_PHONEPE_SALT', 'PAYAPP_TEST_PHONEPE_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_PHONEPE_SALT', 'PAYAPP_LIVE_PHONEPE_WEBHOOK_SECRET'],
  },
  stripe: {
    test: ['PAYAPP_TEST_STRIPE_SECRET_KEY', 'PAYAPP_TEST_STRIPE_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_STRIPE_SECRET_KEY', 'PAYAPP_LIVE_STRIPE_WEBHOOK_SECRET'],
  },
};

// Capability icons
const capabilityIcons: Record<string, any> = {
  cards: CardIcon, upi: Smartphone, netbanking: Banknote, wallets: Wallet,
  refunds: RefreshCw, payouts: ArrowUpDown, tokenization: Shield, international: Globe, webhooks: Webhook
};

interface ProviderConfigData extends Omit<PaymentProviderConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> {}

export default function PaymentProvidersManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Environment>('test');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [healthCheckStatus, setHealthCheckStatus] = useState<Record<string, 'idle' | 'checking' | 'success' | 'error'>>({});

  // Fetch provider configurations
  const { data: configs = [], isLoading } = useQuery<PaymentProviderConfig[]>({
    queryKey: ['/api/admin/payment-provider-configs'],
  });

  // Create/update provider configuration
  const configMutation = useMutation({
    mutationFn: async (data: ProviderConfigData) => {
      return apiRequest('/api/admin/payment-provider-configs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/payment-provider-configs'] });
      toast({ title: "Success", description: "Provider configuration saved successfully" });
      setShowConfigDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save provider configuration", variant: "destructive" });
    }
  });

  // Health check mutation
  const healthCheckMutation = useMutation({
    mutationFn: async ({ provider, environment }: { provider: PaymentProvider, environment: Environment }) => {
      return apiRequest(`/api/admin/payment-providers/${provider}/health-check?environment=${environment}`, {
        method: 'POST',
      });
    },
    onSuccess: (_, { provider, environment }) => {
      const key = `${provider}-${environment}`;
      setHealthCheckStatus(prev => ({ ...prev, [key]: 'success' }));
      toast({ title: "Health Check Passed", description: `${providerDisplayNames[provider]} (${environment}) is working correctly` });
    },
    onError: (_, { provider, environment }) => {
      const key = `${provider}-${environment}`;
      setHealthCheckStatus(prev => ({ ...prev, [key]: 'error' }));
      toast({ title: "Health Check Failed", description: `${providerDisplayNames[provider]} (${environment}) connection failed`, variant: "destructive" });
    }
  });

  const getConfigForProvider = (provider: PaymentProvider, environment: Environment) => {
    return configs.find(c => c.provider === provider && c.environment === environment);
  };

  const handleToggleProvider = async (provider: PaymentProvider, environment: Environment, enabled: boolean) => {
    const existingConfig = getConfigForProvider(provider, environment);
    if (existingConfig) {
      const data: ProviderConfigData = {
        ...existingConfig,
        isEnabled: enabled,
      };
      configMutation.mutate(data);
    }
  };

  const handleHealthCheck = async (provider: PaymentProvider, environment: Environment) => {
    const key = `${provider}-${environment}`;
    setHealthCheckStatus(prev => ({ ...prev, [key]: 'checking' }));
    healthCheckMutation.mutate({ provider, environment });
  };

  const handleConfigureProvider = (provider: PaymentProvider) => {
    setSelectedProvider(provider);
    setShowConfigDialog(true);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Environment variable name copied to clipboard" });
  };

  const renderCapabilityBadges = (provider: PaymentProvider) => {
    const capabilities = capabilityMatrix[provider];
    return Object.entries(capabilities)
      .filter(([_, supported]) => supported)
      .map(([capability]) => {
        const Icon = capabilityIcons[capability];
        return (
          <Badge key={capability} variant="outline" className="text-xs">
            <Icon className="w-3 h-3 mr-1" />
            {capability}
          </Badge>
        );
      });
  };

  const renderProviderCard = (provider: PaymentProvider, environment: Environment) => {
    const config = getConfigForProvider(provider, environment);
    const healthKey = `${provider}-${environment}`;
    const healthStatus = healthCheckStatus[healthKey] || 'idle';
    const requiredSecrets = providerSecretKeys[provider][environment];

    return (
      <Card key={`${provider}-${environment}`} className="relative">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{providerDisplayNames[provider]}</CardTitle>
                <div className="flex flex-wrap gap-1 mt-1">
                  {renderCapabilityBadges(provider)}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Switch
                checked={config?.isEnabled ?? false}
                onCheckedChange={(checked) => handleToggleProvider(provider, environment, checked)}
                data-testid={`toggle-${provider}-${environment}`}
              />
              <Badge variant={config?.isEnabled ? "default" : "secondary"}>
                {config?.isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Configuration Status */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              {config ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">Configured</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-red-600">Not Configured</span>
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleHealthCheck(provider, environment)}
                disabled={!config?.isEnabled || healthStatus === 'checking'}
                data-testid={`health-check-${provider}-${environment}`}
              >
                <Activity className={`w-4 h-4 mr-1 ${healthStatus === 'checking' ? 'animate-spin' : ''}`} />
                {healthStatus === 'checking' ? 'Checking...' : 'Health Check'}
              </Button>
              <Button
                size="sm"
                onClick={() => handleConfigureProvider(provider)}
                data-testid={`configure-${provider}-${environment}`}
              >
                <Settings2 className="w-4 h-4 mr-1" />
                Configure
              </Button>
            </div>
          </div>

          {/* Required Secrets */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Required Environment Variables:</Label>
            <div className="space-y-1">
              {requiredSecrets.map((secretKey) => (
                <div key={secretKey} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                  <code className="text-xs font-mono text-gray-700">{secretKey}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(secretKey)}
                    data-testid={`copy-${secretKey}`}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Health Status */}
          {healthStatus !== 'idle' && (
            <div className={`p-2 rounded text-sm ${
              healthStatus === 'success' ? 'bg-green-50 text-green-700' :
              healthStatus === 'error' ? 'bg-red-50 text-red-700' :
              'bg-yellow-50 text-yellow-700'
            }`}>
              {healthStatus === 'success' && '✅ Connection successful'}
              {healthStatus === 'error' && '❌ Connection failed'}
              {healthStatus === 'checking' && '⏳ Checking connection...'}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">Loading payment providers...</div>
      </div>
    );
  }

  const allProviders: PaymentProvider[] = ['razorpay', 'payu', 'ccavenue', 'cashfree', 'paytm', 'billdesk', 'phonepe', 'stripe'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Payment Providers</h2>
        <div className="text-sm text-gray-600">
          Configure provider-agnostic payment system (no secrets stored in database)
        </div>
      </div>

      {/* Environment Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Environment)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="test">Test Environment</TabsTrigger>
          <TabsTrigger value="live">Live Environment</TabsTrigger>
        </TabsList>

        {/* Test Environment */}
        <TabsContent value="test" className="space-y-4 mt-6">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Test Environment:</strong> Use sandbox credentials for testing payments without real transactions.
            </p>
          </div>
          <div className="grid gap-4">
            {allProviders.map((provider) => renderProviderCard(provider, 'test'))}
          </div>
        </TabsContent>

        {/* Live Environment */}
        <TabsContent value="live" className="space-y-4 mt-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>Live Environment:</strong> Use production credentials for real transactions. Handle with care.
            </p>
          </div>
          <div className="grid gap-4">
            {allProviders.map((provider) => renderProviderCard(provider, 'live'))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Configure {selectedProvider ? providerDisplayNames[selectedProvider] : ''} Provider
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Security Note:</strong> No secrets are stored in the database. 
                Set the required environment variables using Replit Secrets for security.
              </p>
            </div>
            
            {selectedProvider && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Supported Capabilities:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {renderCapabilityBadges(selectedProvider)}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Required Environment Variables:</Label>
                  <div className="grid gap-2 mt-2">
                    {['test', 'live'].map((env) => (
                      <div key={env} className="space-y-1">
                        <div className="text-xs font-medium text-gray-600 uppercase">{env} Environment:</div>
                        {providerSecretKeys[selectedProvider][env as Environment].map((secretKey) => (
                          <div key={secretKey} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                            <code className="text-xs font-mono text-gray-700">{secretKey}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(secretKey)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}