import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Influencer() {
  const [influencerId, setInfluencerId] = useState(""); // In real app, this would be from auth

  const { data: stats } = useQuery({
    queryKey: ["/api/influencers", influencerId, "stats"],
    enabled: !!influencerId,
  });

  const { data: offers } = useQuery({
    queryKey: ["/api/influencers", influencerId, "offers"],
    enabled: !!influencerId,
  });

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Influencer Dashboard</h2>
        <p className="text-gray-600">Track your coupon performance and earnings</p>
      </div>

      {/* Quick Setup - In production, this would be handled by proper auth */}
      {!influencerId && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Login as Influencer</h3>
          <p className="text-sm text-gray-600 mb-4">Enter your influencer ID to view your dashboard</p>
          <div className="flex space-x-3">
            <Input
              type="text"
              placeholder="Enter Influencer ID"
              value={influencerId}
              onChange={(e) => setInfluencerId(e.target.value)}
              className="flex-1"
              data-testid="input-influencer-id"
            />
            <Button 
              onClick={() => {/* This would set the ID */}}
              disabled={!influencerId}
              data-testid="button-login-influencer"
            >
              Login
            </Button>
          </div>
        </div>
      )}

      {influencerId && (
        <>
          {/* Performance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
              <div className="text-3xl font-bold" data-testid="stat-influencer-orders">{stats?.totalOrders || 0}</div>
              <div className="text-blue-100">Orders Delivered</div>
              <div className="text-sm text-blue-200 mt-1">
                <i className="fas fa-arrow-up mr-1"></i>+12% this month
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
              <div className="text-3xl font-bold" data-testid="stat-influencer-sales">₹{stats?.totalSales?.toFixed(2) || '0.00'}</div>
              <div className="text-green-100">Sales Generated</div>
              <div className="text-sm text-green-200 mt-1">
                <i className="fas fa-arrow-up mr-1"></i>+8% this month
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
              <div className="text-3xl font-bold" data-testid="stat-influencer-discount">₹{stats?.totalDiscount?.toFixed(2) || '0.00'}</div>
              <div className="text-purple-100">Discount Offered</div>
              <div className="text-sm text-purple-200 mt-1">
                <i className="fas fa-arrow-up mr-1"></i>+15% this month
              </div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
              <div className="text-3xl font-bold" data-testid="stat-conversion-rate">{stats?.conversionRate?.toFixed(1) || '0.0'}%</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {offers.map((offer: any) => (
                  <div key={offer.id} className="border border-gray-200 rounded-lg p-4" data-testid={`coupon-${offer.code}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="font-mono text-lg font-semibold text-blue-600">{offer.code}</div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        offer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {offer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Discount:</span>
                        <span className="font-medium">
                          {offer.discountType === 'percentage' 
                            ? `${offer.discountValue}% off` 
                            : `₹${offer.discountValue} off`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Usage:</span>
                        <span className="font-medium">{offer.currentUsage}/{offer.globalUsageLimit || '∞'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Expires:</span>
                        <span className="font-medium">
                          {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : 'No expiry'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all" 
                        style={{ 
                          width: offer.globalUsageLimit 
                            ? `${(offer.currentUsage / offer.globalUsageLimit) * 100}%` 
                            : '0%' 
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders via Your Coupons</h3>
            <div className="text-center py-8">
              <div className="text-gray-500">Order tracking coming soon</div>
              <p className="text-gray-400 mt-2">Real-time order data will be available here</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
