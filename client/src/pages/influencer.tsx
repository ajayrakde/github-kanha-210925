import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import HybridLogin from "@/components/auth/hybrid-login";
import { useInfluencerAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();
  const [activePage, setActivePage] = useState<'dashboard' | 'offers'>('dashboard');
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

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { id: 'offers', label: 'My Offers', icon: 'fas fa-tags' },
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
                  setActivePage(item.id as 'dashboard' | 'offers');
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
      <div className="flex-1 lg:ml-0">
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