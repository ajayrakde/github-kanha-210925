import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import HybridLogin from "@/components/auth/hybrid-login";
import { useInfluencerAuth } from "@/hooks/use-auth";

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  // Check if influencer data exists after authentication
  const { data: influencerData } = useQuery({
    queryKey: ['/api/influencer/me'],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: offers } = useQuery({
    queryKey: ["/api/offers"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <div className="text-lg text-gray-600">Loading influencer portal...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HybridLogin 
          userType="influencer"
          title="Influencer Portal"
          onSuccess={() => window.location.reload()}
        />
      </div>
    );
  }

  const influencer = (influencerData as any)?.influencer;

  // Filter offers assigned to this influencer
  const myOffers = Array.isArray(offers) ? offers.filter((offer: any) => 
    offer.assignedInfluencerId === influencer?.id
  ) : [];

  const stats = {
    totalOffers: myOffers.length,
    activeOffers: myOffers.filter((o: any) => o.isActive).length,
    totalUsage: myOffers.reduce((sum: number, offer: any) => sum + (offer.usageCount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Influencer Dashboard</h2>
          <p className="text-gray-600">Welcome {influencer?.name}</p>
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="offers" data-testid="tab-my-offers">My Offers</TabsTrigger>
          </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6 min-h-[600px]">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance Overview</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600" data-testid="stat-total-offers">{stats.totalOffers}</div>
                <div className="text-sm text-gray-600">Total Offers</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600" data-testid="stat-active-offers">{stats.activeOffers}</div>
                <div className="text-sm text-gray-600">Active Offers</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600" data-testid="stat-total-usage">{stats.totalUsage}</div>
                <div className="text-sm text-gray-600">Total Usage</div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-800">Your Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Name</label>
                  <p className="text-gray-900">{influencer?.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Phone</label>
                  <p className="text-gray-900">{influencer?.phone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Email</label>
                  <p className="text-gray-900">{influencer?.email || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Commission Rate</label>
                  <p className="text-gray-900">10%</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="offers" className="mt-6">
          <div className="bg-white rounded-lg shadow-sm p-6 min-h-[600px]">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">My Offer Codes</h3>
            
            {myOffers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No offers assigned to you yet.</p>
                <p className="text-sm text-gray-400 mt-2">Contact admin to get offer codes assigned.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Code</th>
                      <th className="text-left p-4">Type</th>
                      <th className="text-left p-4">Discount</th>
                      <th className="text-left p-4">Usage</th>
                      <th className="text-left p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myOffers.map((offer: any) => (
                      <tr key={offer.id} className="border-b">
                        <td className="p-4 font-mono font-semibold" data-testid={`offer-code-${offer.id}`}>
                          {offer.code}
                        </td>
                        <td className="p-4">{offer.type === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
                        <td className="p-4">
                          {offer.type === 'percentage' ? `${offer.discountPercentage}%` : `₹${offer.discountAmount}`}
                        </td>
                        <td className="p-4">
                          {offer.usageCount || 0}
                          {offer.globalUsageLimit && ` / ${offer.globalUsageLimit}`}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            offer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {offer.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}