import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    username: string;
  };
}

interface OfferTableProps {
  onEdit: (offer: Offer) => void;
}

export default function OfferTable({ onEdit }: OfferTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

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

  if (!offers || offers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No offers found</div>
        <p className="text-gray-400 mt-2">Create your first offer to get started</p>
      </div>
    );
  }

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
          {offers.map((offer) => (
            <tr key={offer.id} data-testid={`offer-row-${offer.id}`}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900 font-mono" data-testid={`offer-code-${offer.id}`}>
                  {offer.code}
                </div>
                <div className="text-sm text-gray-500">
                  Min: ₹{parseFloat(offer.minCartValue).toFixed(0)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900" data-testid={`offer-discount-${offer.id}`}>
                  {offer.discountType === 'percentage' 
                    ? `${offer.discountValue}% off` 
                    : `₹${offer.discountValue} off`}
                </div>
                {offer.maxDiscount && (
                  <div className="text-sm text-gray-500">
                    Max: ₹{parseFloat(offer.maxDiscount).toFixed(0)}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900" data-testid={`offer-influencer-${offer.id}`}>
                  {offer.influencer?.username || 'N/A'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900" data-testid={`offer-usage-${offer.id}`}>
                  {offer.currentUsage}/{offer.globalUsageLimit || '∞'}
                </div>
                <div className="text-sm text-gray-500">
                  Per user: {offer.perUserUsageLimit}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
