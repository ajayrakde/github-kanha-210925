import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useInfluencerAuth } from "@/hooks/use-auth";

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
}

export default function InfluencerOfferTable() {
  const { data: influencerData } = useQuery({
    queryKey: ['/api/influencer/me'],
    retry: false,
  });

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const influencer = (influencerData as any)?.influencer;
  
  // Filter offers assigned to this influencer and only active ones
  const myActiveOffers = Array.isArray(offers) ? offers.filter((offer: any) => 
    offer.influencerId === influencer?.id && offer.isActive
  ) : [];

  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coupon Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
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
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!myActiveOffers || myActiveOffers.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-4">
          <i className="fas fa-tags text-4xl"></i>
        </div>
        <div className="text-gray-500">No active offers assigned to you</div>
        <p className="text-gray-400 mt-2">Contact your admin to get promotional offers assigned</p>
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
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {myActiveOffers.map((offer) => (
            <tr key={offer.id} data-testid={`offer-row-${offer.id}`}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900 font-mono" data-testid={`offer-code-${offer.id}`}>
                  {offer.code}
                </div>
                <div className="text-sm text-gray-500">
                  {offer.name || 'Unnamed offer'}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}