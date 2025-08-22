import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useInfluencerAuth } from "@/hooks/use-auth";
import InfluencerLogin from "@/components/auth/influencer-login";
import { ChevronUp, ChevronDown, Search, TrendingUp, DollarSign, Users, Target } from "lucide-react";

interface Offer {
  code: string;
  orders: number;
  income: number;
  expiry?: string;
  status: 'active' | 'inactive';
}

type SortDirection = 'asc' | 'desc' | null;
type SortColumn = 'code' | 'orders' | 'income' | 'expiry' | 'status';

// Mock dataset
const mockOffers: Offer[] = [
  { code: "SAVE20", orders: 45, income: 23400, expiry: "2025-03-15T00:00:00Z", status: "active" },
  { code: "WELCOME10", orders: 78, income: 15600, expiry: "2025-02-28T00:00:00Z", status: "active" },
  { code: "FLASH50", orders: 23, income: 34500, status: "active" },
  { code: "NEWYEAR", orders: 0, income: 0, expiry: "2024-12-31T23:59:59Z", status: "inactive" },
  { code: "SUMMER25", orders: 67, income: 42300, expiry: "2025-06-30T00:00:00Z", status: "active" },
  { code: "HOLIDAY15", orders: 12, income: 8900, expiry: "2024-12-25T00:00:00Z", status: "inactive" },
  { code: "EARLY30", orders: 34, income: 51200, expiry: "2025-04-10T00:00:00Z", status: "active" },
  { code: "LAUNCH", orders: 89, income: 67800, status: "active" },
  { code: "STUDENT20", orders: 156, income: 31200, expiry: "2025-12-31T00:00:00Z", status: "active" },
  { code: "VIP40", orders: 8, income: 9600, expiry: "2025-01-31T00:00:00Z", status: "inactive" }
];

export default function Influencer() {
  const { isAuthenticated, isLoading, logout } = useInfluencerAuth();
  
  // State for filtering and sorting
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchText, setSearchText] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedFilter = localStorage.getItem('influencer-filter-status');
    const savedSort = localStorage.getItem('influencer-sort-column');
    const savedDirection = localStorage.getItem('influencer-sort-direction');

    if (savedFilter && ['all', 'active', 'inactive'].includes(savedFilter)) {
      setFilterStatus(savedFilter as 'all' | 'active' | 'inactive');
    }
    if (savedSort && savedDirection) {
      setSortColumn(savedSort as SortColumn);
      setSortDirection(savedDirection as SortDirection);
    }
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('influencer-filter-status', filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    if (sortColumn && sortDirection) {
      localStorage.setItem('influencer-sort-column', sortColumn);
      localStorage.setItem('influencer-sort-direction', sortDirection);
    }
  }, [sortColumn, sortDirection]);

  // Filter and sort offers
  const filteredAndSortedOffers = useMemo(() => {
    let filtered = mockOffers;

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(offer => offer.status === filterStatus);
    }

    // Apply search filter
    if (searchText.trim()) {
      filtered = filtered.filter(offer => 
        offer.code.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn];
        let bVal: any = b[sortColumn];

        // Handle expiry date sorting
        if (sortColumn === 'expiry') {
          // Convert to comparable format (null/undefined becomes a very late date for sorting)
          aVal = aVal ? new Date(aVal).getTime() : Number.MAX_SAFE_INTEGER;
          bVal = bVal ? new Date(bVal).getTime() : Number.MAX_SAFE_INTEGER;
        }

        // Handle string sorting
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        if (aVal > bVal) comparison = 1;

        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [filterStatus, searchText, sortColumn, sortDirection]);

  // Calculate KPIs from filtered offers
  const kpis = useMemo(() => {
    const activeOffers = filteredAndSortedOffers.filter(offer => offer.status === 'active');
    const totalOrders = filteredAndSortedOffers.reduce((sum, offer) => sum + offer.orders, 0);
    const totalIncome = filteredAndSortedOffers.reduce((sum, offer) => sum + offer.income, 0);
    
    // Calculate conversion rate (orders per active offer)
    const conversionRate = activeOffers.length > 0 ? (totalOrders / activeOffers.length) : 0;

    return {
      activeOffers: activeOffers.length,
      totalOrders,
      totalIncome,
      conversionRate
    };
  }, [filteredAndSortedOffers]);

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Render sort icon
  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

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
          Logout
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Active Offers</p>
                <p className="text-3xl font-bold" data-testid="kpi-active-offers">
                  {kpis.activeOffers}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Orders Generated</p>
                <p className="text-3xl font-bold" data-testid="kpi-total-orders">
                  {kpis.totalOrders.toLocaleString('en-IN')}
                </p>
              </div>
              <Users className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Income Earned</p>
                <p className="text-3xl font-bold" data-testid="kpi-total-income">
                  {formatCurrency(kpis.totalIncome)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Avg Orders/Offer</p>
                <p className="text-3xl font-bold" data-testid="kpi-conversion-rate">
                  {kpis.conversionRate.toFixed(1)}
                </p>
              </div>
              <Target className="w-8 h-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Offers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive') => setFilterStatus(value)}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search offer codes..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10"
                data-testid="search-offers"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAndSortedOffers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No offers to display.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th 
                      className="text-left p-4 cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('code')}
                      data-testid="sort-code"
                    >
                      <div className="flex items-center gap-2">
                        OFFER CODE
                        {renderSortIcon('code')}
                      </div>
                    </th>
                    <th 
                      className="text-left p-4 cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('orders')}
                      data-testid="sort-orders"
                    >
                      <div className="flex items-center gap-2">
                        No. of Orders
                        {renderSortIcon('orders')}
                      </div>
                    </th>
                    <th 
                      className="text-left p-4 cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('income')}
                      data-testid="sort-income"
                    >
                      <div className="flex items-center gap-2">
                        Income earned (₹)
                        {renderSortIcon('income')}
                      </div>
                    </th>
                    <th 
                      className="text-left p-4 cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('expiry')}
                      data-testid="sort-expiry"
                    >
                      <div className="flex items-center gap-2">
                        Offer expiry date
                        {renderSortIcon('expiry')}
                      </div>
                    </th>
                    <th 
                      className="text-left p-4 cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('status')}
                      data-testid="sort-status"
                    >
                      <div className="flex items-center gap-2">
                        Status
                        {renderSortIcon('status')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedOffers.map((offer, index) => (
                    <tr key={offer.code} className="border-b hover:bg-gray-50" data-testid={`offer-row-${offer.code}`}>
                      <td className="p-4 font-mono font-semibold text-purple-600">{offer.code}</td>
                      <td className="p-4">{offer.orders.toLocaleString('en-IN')}</td>
                      <td className="p-4 font-semibold">{formatCurrency(offer.income)}</td>
                      <td className="p-4">{formatDate(offer.expiry)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          offer.status === 'active' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {offer.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}