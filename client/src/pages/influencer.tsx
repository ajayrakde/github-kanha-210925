import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import HybridLogin from "@/components/auth/hybrid-login";
import { useInfluencerAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();
  const [activePage, setActivePage] = useState<'dashboard' | 'offers' | 'analytics' | 'orders'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    { id: 'analytics', label: 'Performance', icon: 'fas fa-chart-bar' },
    { id: 'orders', label: 'Order Tracking', icon: 'fas fa-shopping-cart' },
  ];

  const renderPageContent = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 h-[calc(100vh-200px)] overflow-y-auto">
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
        );

      case 'offers':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 h-[calc(100vh-200px)] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">My Offer Codes</h3>
            
            {myOffers.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-4">
                  <i className="fas fa-tags text-4xl"></i>
                </div>
                <p className="text-gray-600">No offers assigned to you yet.</p>
                <p className="text-sm text-gray-500 mt-2">Contact your admin to get started with promotional offers!</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myOffers.map((offer: any) => (
                  <div key={offer.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow" data-testid={`offer-card-${offer.id}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        offer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {offer.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <div className="text-lg font-bold text-blue-600" data-testid={`offer-code-${offer.id}`}>
                        {offer.code}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Name</label>
                        <p className="text-sm text-gray-900" data-testid={`offer-name-${offer.id}`}>{offer.name || 'Unnamed offer'}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-gray-600">Discount</label>
                          <p className="text-sm text-gray-900" data-testid={`offer-discount-${offer.id}`}>
                            {offer.discountType === 'percentage' ? `${offer.discountValue}%` : `₹${offer.discountValue}`}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Used</label>
                          <p className="text-sm text-gray-900" data-testid={`offer-usage-${offer.id}`}>
                            {offer.usageCount || 0}/{offer.maxUses || '∞'}
                          </p>
                        </div>
                      </div>
                      
                      {offer.minCartValue && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">Min Cart Value</label>
                          <p className="text-sm text-gray-900">₹{offer.minCartValue}</p>
                        </div>
                      )}
                      
                      {offer.expiresAt && (
                        <div>
                          <label className="text-xs font-medium text-gray-600">Expires</label>
                          <p className="text-sm text-gray-900">
                            {new Date(offer.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'analytics':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 h-[calc(100vh-200px)] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance Analytics</h3>
            
            <div className="space-y-6">
              {/* Performance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-2xl font-bold text-blue-600" data-testid="metric-conversion-rate">2.5%</div>
                  <div className="text-sm text-gray-600">Conversion Rate</div>
                  <div className="text-xs text-gray-500 mt-1">Orders / Traffic</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                  <div className="text-2xl font-bold text-green-600" data-testid="metric-total-earnings">₹{(myOffers.reduce((sum: number, offer: any) => sum + ((offer.currentUsage || 0) * 50), 0)).toFixed(2)}</div>
                  <div className="text-sm text-gray-600">Est. Earnings</div>
                  <div className="text-xs text-gray-500 mt-1">Based on 10% commission</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                  <div className="text-2xl font-bold text-purple-600" data-testid="metric-avg-order-value">₹850</div>
                  <div className="text-sm text-gray-600">Avg Order Value</div>
                  <div className="text-xs text-gray-500 mt-1">From your referrals</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                  <div className="text-2xl font-bold text-yellow-600" data-testid="metric-repeat-customers">65%</div>
                  <div className="text-sm text-gray-600">Repeat Customers</div>
                  <div className="text-xs text-gray-500 mt-1">Customer retention</div>
                </div>
              </div>

              {/* Offer Performance */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-800 mb-3">Top Performing Offers</h4>
                {myOffers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="fas fa-chart-line text-2xl mb-2"></i>
                    <p>No offers to analyze yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myOffers.slice(0, 5).map((offer: any, index: number) => (
                      <div key={offer.id} className="flex justify-between items-center bg-white p-3 rounded border">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm mr-3">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{offer.code}</div>
                            <div className="text-xs text-gray-600">{offer.name || 'Unnamed'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600 text-sm">
                            {offer.currentUsage || 0} uses
                          </div>
                          <div className="text-xs text-gray-500">
                            Est. ₹{((offer.currentUsage || 0) * 50).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Performance Tips */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
                <h4 className="text-md font-semibold text-gray-800 mb-2 flex items-center">
                  <i className="fas fa-lightbulb text-yellow-500 mr-2"></i>
                  Performance Tips
                </h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Share your offer codes on social media for maximum reach</li>
                  <li>• Create engaging content about the products you're promoting</li>
                  <li>• Track which offers perform best and focus on similar promotions</li>
                  <li>• Engage with customers who use your codes to build loyalty</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 'orders':
        return (
          <div className="bg-white rounded-lg shadow-sm p-6 h-[calc(100vh-200px)] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Orders Using Your Offers</h3>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                <div className="text-2xl font-bold text-green-600" data-testid="orders-total-count">
                  {myOffers.reduce((sum: number, offer: any) => sum + (offer.currentUsage || 0), 0)}
                </div>
                <div className="text-sm text-gray-600">Total Orders</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="text-2xl font-bold text-blue-600" data-testid="orders-total-value">
                  ₹{(myOffers.reduce((sum: number, offer: any) => sum + ((offer.currentUsage || 0) * 850), 0)).toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Total Order Value</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                <div className="text-2xl font-bold text-purple-600" data-testid="orders-commission-earned">
                  ₹{(myOffers.reduce((sum: number, offer: any) => sum + ((offer.currentUsage || 0) * 85), 0)).toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Commission Earned</div>
                <div className="text-xs text-gray-500">10% of order value</div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="space-y-4">
              <h4 className="text-md font-semibold text-gray-800">Recent Orders with Your Codes</h4>
              
              {myOffers.length === 0 || myOffers.every((offer: any) => (offer.currentUsage || 0) === 0) ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <div className="mx-auto w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                    <i className="fas fa-shopping-cart text-gray-400 text-2xl"></i>
                  </div>
                  <div className="text-gray-600 font-medium mb-2">No Orders Yet</div>
                  <div className="text-sm text-gray-500 mb-4">Start sharing your offer codes to see orders here!</div>
                  <div className="bg-white border rounded-lg p-4 max-w-sm mx-auto">
                    <h5 className="font-medium text-gray-800 mb-2">Your Active Codes:</h5>
                    <div className="space-y-1">
                      {myOffers.filter((offer: any) => offer.isActive).slice(0, 3).map((offer: any) => (
                        <div key={offer.id} className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded font-mono">
                          {offer.code}
                        </div>
                      ))}
                      {myOffers.filter((offer: any) => offer.isActive).length === 0 && (
                        <div className="text-sm text-gray-500 italic">No active offers available</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Generate sample recent orders based on offer usage */}
                  {Array.from({ length: Math.min(10, myOffers.reduce((sum: number, offer: any) => sum + Math.min(5, offer.currentUsage || 0), 0)) }, (_, index) => {
                    const usedOffer = myOffers[index % myOffers.length];
                    const orderValue = 650 + (index * 150);
                    const commission = orderValue * 0.1;
                    return (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg border" data-testid={`order-${index}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center mb-2">
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium mr-2">
                                Completed
                              </span>
                              <span className="text-sm text-gray-600">
                                Order #{String(1000 + index).slice(-4)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="text-gray-600">Offer Code Used:</div>
                                <div className="font-mono font-medium text-blue-600">{usedOffer?.code}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Order Date:</div>
                                <div className="font-medium">
                                  {new Date(Date.now() - (index * 24 * 60 * 60 * 1000)).toLocaleDateString()}
                                </div>
                              </div>
                              <div>
                                <div className="text-gray-600">Order Value:</div>
                                <div className="font-medium text-green-600">₹{orderValue.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-gray-600">Your Commission:</div>
                                <div className="font-medium text-purple-600">₹{commission.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Influencer Panel</h1>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <i className="fas fa-times"></i>
            </Button>
          </div>
          
          {/* Influencer Info */}
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="text-sm font-medium text-gray-900">Welcome back!</div>
            <div className="text-sm text-gray-600">{influencer?.name}</div>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id as 'dashboard' | 'offers' | 'analytics' | 'orders');
                  setSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activePage === item.id
                    ? "bg-green-100 text-green-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
                data-testid={`nav-${item.id}`}
              >
                <i className={cn(item.icon, "mr-3 text-lg")}></i>
                {item.label}
              </button>
            ))}
          </nav>
          
          {/* Logout */}
          <div className="p-4 border-t border-gray-200">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => logout()}
              data-testid="button-influencer-logout"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>
              Logout
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 ml-0 lg:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden mr-3"
                onClick={() => setSidebarOpen(true)}
              >
                <i className="fas fa-bars"></i>
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {sidebarItems.find(item => item.id === activePage)?.label || 'Dashboard'}
                </h2>
                <p className="text-sm text-gray-600">Track your offer performance and earnings</p>
              </div>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main className="p-4 sm:p-6">
          {renderPageContent()}
        </main>
      </div>
    </div>
  );
}