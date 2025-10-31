import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Offer {
  id: string;
  code: string;
  name: string | null;
  discountType: string;
  discountValue: string;
  maxDiscount: string | null;
  minCartValue: string;
  globalUsageLimit: number | null;
  perUserUsageLimit: number;
  currentUsage: number;
  isActive: boolean;
  endDate: string | null;
  influencer?: {
    id: string;
    name: string;
    username?: string;
  };
  commissionType?: "percentage" | "flat" | null;
  commissionValue?: string | null;
  commissionEarned?: string;
  uniqueCustomers?: number;
  redemptionCount?: number;
  orderCount?: number;
  averageOrderValue?: string;
}

interface Influencer {
  id: string;
  name: string;
  username?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface OfferTableProps {
  onEdit: (offer: Offer) => void;
}

export default function OfferTable({ onEdit }: OfferTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Filter and pagination state
  const [filterInfluencer, setFilterInfluencer] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Get influencers for filter dropdown
  const { data: influencers } = useQuery<Influencer[]>({
    queryKey: ["/api/influencers"],
  });

  // Build query parameters
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(filterInfluencer !== 'all' && { influencerId: filterInfluencer }),
    ...(filterStatus !== 'all' && { isActive: filterStatus }),
  });

  const { data: offersResponse, isLoading } = useQuery<PaginatedResponse<Offer>>({
    queryKey: ["/api/offers", page, limit, filterInfluencer, filterStatus],
    queryFn: async () => {
      const response = await fetch(`/api/offers?${queryParams.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch offers');
      return response.json();
    },
  });

  const offers = offersResponse?.data || [];
  const totalPages = offersResponse?.totalPages || 1;

  const toggleOfferMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/offers/${id}`, {
        isActive: !isActive,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({
        title: "Offer updated",
        description: "Offer status has been successfully updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update offer status",
        variant: "destructive",
      });
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const response = await apiRequest("DELETE", `/api/offers/${offerId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({
        title: "Offer deleted",
        description: "Offer has been successfully deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete offer",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coupon Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Influencer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array(3).fill(0).map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                <td className="px-6 py-4 whitespace-nowrap"><div className="h-6 bg-gray-200 rounded w-16"></div></td>
                <td className="px-6 py-4 whitespace-nowrap"><div className="h-8 bg-gray-200 rounded w-20"></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const handleFilterChange = (type: 'influencer' | 'status' | 'limit', value: string) => {
    if (type === 'influencer') {
      setFilterInfluencer(value);
      setPage(1); // Reset to first page
    } else if (type === 'status') {
      setFilterStatus(value);
      setPage(1); // Reset to first page
    } else if (type === 'limit') {
      setLimit(parseInt(value));
      setPage(1); // Reset to first page
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <Button
          key={i}
          variant={i === page ? "default" : "outline"}
          size="sm"
          onClick={() => setPage(i)}
          className="w-8 h-8 p-0"
        >
          {i}
        </Button>
      );
    }

    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="text-sm text-gray-600">
          Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, offersResponse?.total || 0)} of {offersResponse?.total || 0} offers
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <i className="fas fa-chevron-left"></i>
          </Button>
          {pages}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            <i className="fas fa-chevron-right"></i>
          </Button>
        </div>
      </div>
    );
  };

  if (!offers || offers.length === 0) {
    return (
      <div>
        {/* Filter Controls */}
        <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Influencer Search:</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Search by influencer name..."
                  value={filterInfluencer === 'all' ? '' : (influencers?.find(inf => inf.id === filterInfluencer)?.name || '')}
                  onChange={(e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    if (!searchTerm) {
                      handleFilterChange('influencer', 'all');
                    } else {
                      const matchedInfluencer = influencers?.find(inf => 
                        inf.name.toLowerCase().includes(searchTerm)
                      );
                      if (matchedInfluencer) {
                        handleFilterChange('influencer', matchedInfluencer.id);
                      } else {
                        handleFilterChange('influencer', 'none');
                      }
                    }
                  }}
                  className="w-48"
                  data-testid="input-influencer-search"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange('influencer', 'all')}
                  data-testid="button-clear-influencer-search"
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <Select value={filterStatus} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Per page:</label>
            <Select value={limit.toString()} onValueChange={(value) => handleFilterChange('limit', value)}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-500">No offers found</div>
          <p className="text-gray-400 mt-2">{filterInfluencer !== 'all' || filterStatus !== 'all' ? 'Try adjusting your filters' : 'Create your first offer to get started'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Controls */}
      <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Influencer:</label>
            <Select value={filterInfluencer} onValueChange={(value) => handleFilterChange('influencer', value)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Influencers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Influencers</SelectItem>
                {influencers?.map((influencer) => (
                  <SelectItem key={influencer.id} value={influencer.id}>
                    {influencer.username ?? influencer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <Select value={filterStatus} onValueChange={(value) => handleFilterChange('status', value)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Per page:</label>
          <Select value={limit.toString()} onValueChange={(value) => handleFilterChange('limit', value)}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coupon Code</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Influencer</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {offers.map((offer) => {
            const numericCommissionValue = offer.commissionValue ? Number(offer.commissionValue) : null;
            const hasCommissionValue =
              offer.commissionType && numericCommissionValue !== null && !Number.isNaN(numericCommissionValue);
            const commissionValueDisplay = hasCommissionValue && numericCommissionValue !== null
              ? numericCommissionValue.toString()
              : null;
            const averageOrderValueNumber = offer.averageOrderValue ? Number(offer.averageOrderValue) : 0;
            const safeAverageOrderValue = Number.isNaN(averageOrderValueNumber) ? 0 : averageOrderValueNumber;

            return (
              <tr key={offer.id} data-testid={`offer-row-${offer.id}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 font-mono" data-testid={`offer-code-${offer.id}`}>
                    {offer.code}
                  </div>
                  <div className="text-sm text-gray-500">
                    {offer.name || 'Unnamed offer'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900" data-testid={`offer-discount-${offer.id}`}>
                    {offer.discountType === 'percentage'
                      ? `${offer.discountValue}% off`
                      : `₹${offer.discountValue} off`}
                  </div>
                  <div className="text-sm text-gray-500">
                    Min cart: ₹{parseFloat(offer.minCartValue).toFixed(0)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {offer.influencer ? (
                    <div>
                      <div className="text-sm font-medium text-gray-900" data-testid={`offer-influencer-${offer.id}`}>
                        {offer.influencer.name}
                      </div>
                      <div className="text-sm text-gray-500">Assigned</div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-gray-600">Unassigned</Badge>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {offer.influencer ? (
                    hasCommissionValue ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          {offer.commissionType === 'flat'
                            ? `Rs.${commissionValueDisplay}`
                            : `${commissionValueDisplay}%`}
                        </div>
                        <div className="text-sm text-gray-500">
                          {offer.commissionType === 'flat' ? 'per order' : 'of order value'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Not configured</div>
                    )
                  ) : (
                    <div className="text-sm text-gray-500">Not applicable</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900" data-testid={`offer-usage-${offer.id}`}>
                    Redemptions: {offer.redemptionCount ?? offer.currentUsage}
                  </div>
                  <div className="text-sm text-gray-500">
                    Unique customers: {offer.uniqueCustomers ?? 0}
                  </div>
                  <div className="text-sm text-gray-500">
                    No. of Orders: {offer.orderCount ?? 0}
                  </div>
                  <div className="text-sm text-gray-500">
                    Avg.Order Value: ₹{safeAverageOrderValue.toFixed(2)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-testid={`offer-expiry-${offer.id}`}>
                  {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : 'No expiry'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={offer.isActive ? "default" : "secondary"}>
                    {offer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(offer)}
                      className="text-blue-600 hover:text-blue-700"
                      data-testid={`button-edit-offer-${offer.id}`}
                    >
                      <i className="fas fa-edit"></i>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleOfferMutation.mutate({ id: offer.id, isActive: offer.isActive })}
                      disabled={toggleOfferMutation.isPending}
                      className={offer.isActive ? "text-yellow-600 hover:text-yellow-700" : "text-green-600 hover:text-green-700"}
                      data-testid={`button-toggle-offer-${offer.id}`}
                    >
                      <i className={`fas ${offer.isActive ? 'fa-pause' : 'fa-play'}`}></i>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteOfferMutation.mutate(offer.id)}
                      disabled={deleteOfferMutation.isPending}
                      className="text-red-600 hover:text-red-700"
                      data-testid={`button-delete-offer-${offer.id}`}
                    >
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      
      {renderPagination()}
    </div>
  );
}
