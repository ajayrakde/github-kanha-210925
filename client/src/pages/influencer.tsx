import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import HybridLogin from "@/components/auth/hybrid-login";
import { useInfluencerAuth } from "@/hooks/use-auth";
import InfluencerOfferTable from "@/components/influencer/offer-table";

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'offers'>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
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
          onSuccess={() => {
            // No need to reload, auth hooks will automatically update
          }}
        />
      </div>
    );
  }

  const influencer = (influencerData as any)?.influencer;

  // Filter offers assigned to this influencer
  const myOffers = Array.isArray(offers) ? offers.filter((offer: any) => 
    offer.influencerId === influencer?.id
  ) : [];

  const stats = {
    totalOffers: myOffers.length,
    activeOffers: myOffers.filter((o: any) => o.isActive).length,
    totalUsage: myOffers.reduce((sum: number, offer: any) => sum + (offer.usageCount || 0), 0),
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { id: 'offers', label: 'My Offers', icon: 'fas fa-tags' },
  ];

  type TabValue = 'dashboard' | 'offers';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={cn(
        "bg-white shadow-lg transition-all duration-300 ease-in-out flex-shrink-0",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            {!sidebarCollapsed && (
              <h1 className="text-xl font-semibold text-gray-900 flex-1">Influencer Panel</h1>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              data-testid="toggle-sidebar"
              className={cn(
                "p-2 hover:bg-gray-100 rounded-md border border-gray-300 font-bold text-lg",
                sidebarCollapsed && "mx-auto"
              )}
            >
              <span className="text-gray-600">
                {sidebarCollapsed ? "›" : "‹"}
              </span>
            </Button>
          </div>
          
          {/* Influencer Info */}
          {!sidebarCollapsed && (
            <div className="px-4 py-4 border-b border-gray-200">
              <div className="text-sm font-medium text-gray-900">Welcome back!</div>
              <div className="text-sm text-gray-600">{influencer?.name}</div>
            </div>
          )}
          
          {/* Navigation */}
          <nav className={cn("flex-1 py-4 space-y-1", sidebarCollapsed ? "px-2" : "px-4")}>
            {sidebarItems.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabValue)}
                className={cn(
                  "w-full flex items-center text-sm font-medium rounded-lg transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1",
                  sidebarCollapsed ? "px-2 py-3 justify-center" : "px-4 py-3",
                  activeTab === item.id
                    ? "bg-green-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 hover:shadow-sm"
                )}
                data-testid={`nav-${item.id}`}
                tabIndex={0}
                role="tab"
                aria-selected={activeTab === item.id}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <i className={cn(item.icon, "text-lg flex-shrink-0", !sidebarCollapsed && "mr-3")}></i>
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {activeTab === item.id && !sidebarCollapsed && (
                  <div className="absolute right-2 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
            ))}
          </nav>
          
          {/* Logout */}
          <div className={cn("border-t border-gray-200", sidebarCollapsed ? "p-2" : "p-4")}>
            <Button 
              variant="outline" 
              className={cn("w-full", sidebarCollapsed && "px-2")}
              onClick={() => logout()}
              data-testid="button-influencer-logout"
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <i className={cn("fas fa-sign-out-alt flex-shrink-0", !sidebarCollapsed && "mr-2")}></i>
              {!sidebarCollapsed && <span>Logout</span>}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center h-16 px-4 sm:px-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {sidebarItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
              <p className="text-sm text-gray-600">Track your offer performance and earnings</p>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
            <TabsContent value="dashboard">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Performance Overview</h3>
                  <p className="text-sm text-gray-600 mt-1">View your offer statistics and information</p>
                </div>
              </div>
              <div className="bg-gray-50 p-4">
                <div className="bg-white rounded-lg shadow-sm p-6">
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
              </div>
            </TabsContent>

            <TabsContent value="offers">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 p-4 border-b border-gray-200 bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">My Offer Codes</h3>
                  <p className="text-sm text-gray-600 mt-1">View your assigned active promotional offers</p>
                </div>
              </div>
              <div className="bg-gray-50 p-4 overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <InfluencerOfferTable />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}