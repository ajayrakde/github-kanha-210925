import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useInfluencerAuth } from "@/hooks/use-auth";
import InfluencerLogin from "@/components/auth/influencer-login";

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();

  const { data: stats } = useQuery({
    queryKey: ["/api/influencers/stats"],
    enabled: isAuthenticated,
  });

  const { data: offers } = useQuery({
    queryKey: ["/api/influencers/offers"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <InfluencerLogin />;
  }

  return (
    <div className="space-y-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Influencer Dashboard</h2>
          <p className="text-gray-600">Track your coupon performance and earnings</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => logout()}
          data-testid="button-influencer-logout"
        >
          <i className="fas fa-sign-out-alt mr-2"></i>
          Logout
        </Button>
      </div>

      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
          <div className="text-3xl font-bold" data-testid="stat-influencer-orders">{(stats as any)?.totalOrders || 0}</div>
          <div className="text-blue-100">Orders Delivered</div>
          <div className="text-sm text-blue-200 mt-1">
            <i className="fas fa-arrow-up mr-1"></i>+12% this month
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
          <div className="text-3xl font-bold" data-testid="stat-influencer-sales">₹{(stats as any)?.totalSales?.toFixed(2) || '0.00'}</div>
          <div className="text-green-100">Sales Generated</div>
          <div className="text-sm text-green-200 mt-1">
            <i className="fas fa-arrow-up mr-1"></i>+8% this month
          </div>
        </div>
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
          <div className="text-3xl font-bold" data-testid="stat-influencer-discount">₹{(stats as any)?.totalDiscount?.toFixed(2) || '0.00'}</div>
          <div className="text-purple-100">Discount Offered</div>
          <div className="text-sm text-purple-200 mt-1">
            <i className="fas fa-arrow-up mr-1"></i>+15% this month
          </div>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
          <div className="text-3xl font-bold" data-testid="stat-conversion-rate">{(stats as any)?.conversionRate?.toFixed(1) || '0.0'}%</div>
          <div className="text-orange-100">Conversion Rate</div>
          <div className="text-sm text-orange-200 mt-1">
            <i className="fas fa-arrow-up mr-1"></i>+2.1% this month
          </div>
        </div>
      </div>

      {/* Active Coupons */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Active Coupons</h3>
        
        {!Array.isArray(offers) || offers.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500">No coupons assigned yet</div>
            <p className="text-gray-400 mt-2">Contact admin to get your coupons</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.isArray(offers) && offers.map((offer: any) => (
              <Card key={offer.id} className="border-l-4 border-l-purple-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex justify-between items-center">
                    <span className="font-mono font-bold text-purple-600" data-testid={`coupon-code-${offer.id}`}>
                      {offer.code}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${offer.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {offer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Discount:</span>
                      <span className="font-semibold">
                        {offer.discountType === 'percentage' ? `${offer.discountValue}%` : `₹${offer.discountValue}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Usage:</span>
                      <span>{offer.currentUsage || 0}/{offer.globalUsageLimit || '∞'}</span>
                    </div>
                    {offer.minCartValue && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Min Order:</span>
                        <span>₹{offer.minCartValue}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}