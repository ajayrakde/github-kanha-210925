import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const offerSchema = z.object({
  code: z.string().min(1, "Coupon code is required").toUpperCase(),
  name: z.string().optional(),
  discountType: z.enum(["percentage", "flat"], { required_error: "Discount type is required" }),
  discountValue: z.string().min(1, "Discount value is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Discount value must be positive"),
  maxDiscount: z.string().optional().refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), "Max discount must be positive"),
  minCartValue: z.string().min(1, "Minimum cart value is required").refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "Minimum cart value must be non-negative"),
  globalUsageLimit: z.string().optional().refine((val) => !val || (!isNaN(Number(val)) && Number(val) > 0), "Global usage limit must be positive"),
  perUserUsageLimit: z.string().min(1, "Per user usage limit is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Per user usage limit must be positive"),
  influencerId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().default(true),
  commissionType: z.preprocess(
    value => value === "" ? undefined : value,
    z.enum(["percentage", "flat"]).optional(),
  ),
  commissionValue: z.preprocess(
    value => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string()
      .optional()
      .refine(val => val === undefined || (!isNaN(Number(val)) && Number(val) > 0), "Commission value must be positive"),
  ),
}).superRefine((data, ctx) => {
  const hasInfluencer = typeof data.influencerId === "string" && data.influencerId.trim() !== "";
  if (hasInfluencer) {
    if (!data.commissionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commissionType"],
        message: "Commission type is required when an influencer is assigned",
      });
    }
    if (!data.commissionValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commissionValue"],
        message: "Commission value is required when an influencer is assigned",
      });
    }
  }
});

type OfferFormData = z.infer<typeof offerSchema>;

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
  influencerId: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  commissionType: "percentage" | "flat" | null;
  commissionValue: string | null;
}

interface Influencer {
  id: string;
  name: string;
  email: string | null;
}


interface OfferFormProps {
  offer?: Offer | null;
  onClose: () => void;
}

export default function OfferForm({ offer, onClose }: OfferFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: influencers } = useQuery<Influencer[]>({
    queryKey: ["/api/influencers"],
  });


  const form = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      code: offer?.code || "",
      name: offer?.name || "",
      discountType: offer?.discountType as "percentage" | "flat" || "percentage",
      discountValue: offer?.discountValue || "",
      maxDiscount: offer?.maxDiscount || "",
      minCartValue: offer?.minCartValue || "0",
      globalUsageLimit: offer?.globalUsageLimit?.toString() || "",
      perUserUsageLimit: offer?.perUserUsageLimit?.toString() || "1",
      influencerId: offer?.influencerId || "",
      startDate: offer?.startDate ? new Date(offer.startDate).toISOString().split('T')[0] : "",
      endDate: offer?.endDate ? new Date(offer.endDate).toISOString().split('T')[0] : "",
      isActive: offer?.isActive ?? true,
      commissionType: offer?.commissionType ?? undefined,
      commissionValue: offer?.commissionValue ?? undefined,
    },
  });

  const influencerId = form.watch("influencerId");

  useEffect(() => {
    if (!influencerId || influencerId.trim() === "") {
      form.setValue("commissionType", undefined);
      form.setValue("commissionValue", undefined);
    }
  }, [form, influencerId]);

  const createOfferMutation = useMutation({
    mutationFn: async (data: OfferFormData) => {
      const payload = {
        ...data,
        discountValue: data.discountValue,
        maxDiscount: data.maxDiscount || undefined,
        minCartValue: data.minCartValue,
        globalUsageLimit: data.globalUsageLimit ? parseInt(data.globalUsageLimit) : undefined,
        perUserUsageLimit: parseInt(data.perUserUsageLimit),
        influencerId: data.influencerId && data.influencerId.trim() !== "" ? data.influencerId : null,
        commissionType: data.influencerId && data.influencerId.trim() !== "" ? data.commissionType ?? null : null,
        commissionValue: data.influencerId && data.influencerId.trim() !== "" ? data.commissionValue ?? null : null,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : undefined,
      };
      
      const url = offer ? `/api/offers/${offer.id}` : "/api/offers";
      const method = offer ? "PATCH" : "POST";
      
      const response = await apiRequest(method, url, payload);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({
        title: offer ? "Offer updated" : "Offer created",
        description: offer ? "Offer has been successfully updated" : "Offer has been successfully created",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: offer ? "Failed to update offer" : "Failed to create offer",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OfferFormData) => {
    createOfferMutation.mutate(data);
  };

  const discountType = form.watch("discountType");
  const commissionType = form.watch("commissionType");
  const hasInfluencer = Boolean(influencerId && influencerId.trim() !== "");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="code">Coupon Code *</Label>
            <Input
              id="code"
              {...form.register("code")}
              placeholder="SAVE10"
              className="mt-2 uppercase"
              data-testid="input-offer-code"
            />
            {form.formState.errors.code && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.code.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="name">Offer Name</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="Save 10% discount"
              className="mt-2"
              data-testid="input-offer-name"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="discountType">Discount Type *</Label>
            <Select
              value={form.watch("discountType")}
              onValueChange={(value) => form.setValue("discountType", value as "percentage" | "flat")}
            >
              <SelectTrigger className="mt-2" data-testid="select-discount-type">
                <SelectValue placeholder="Select discount type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="flat">Flat Amount (₹)</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.discountType && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.discountType.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="discountValue">
              Discount Value * {discountType === "percentage" ? "(%)" : "(₹)"}
            </Label>
            <Input
              id="discountValue"
              {...form.register("discountValue")}
              placeholder={discountType === "percentage" ? "10" : "100"}
              className="mt-2"
              data-testid="input-discount-value"
            />
            {form.formState.errors.discountValue && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.discountValue.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxDiscount">Max Discount (₹)</Label>
            <Input
              id="maxDiscount"
              {...form.register("maxDiscount")}
              placeholder="1000"
              className="mt-2"
              disabled={discountType === "flat"}
              data-testid="input-max-discount"
            />
            {form.formState.errors.maxDiscount && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.maxDiscount.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="minCartValue">Min Cart Value (₹) *</Label>
            <Input
              id="minCartValue"
              {...form.register("minCartValue")}
              placeholder="500"
              className="mt-2"
              data-testid="input-min-cart-value"
            />
            {form.formState.errors.minCartValue && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.minCartValue.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="globalUsageLimit">Global Usage Limit</Label>
            <Input
              id="globalUsageLimit"
              {...form.register("globalUsageLimit")}
              placeholder="100"
              className="mt-2"
              data-testid="input-global-usage-limit"
            />
            {form.formState.errors.globalUsageLimit && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.globalUsageLimit.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="perUserUsageLimit">Per User Usage Limit *</Label>
            <Input
              id="perUserUsageLimit"
              {...form.register("perUserUsageLimit")}
              placeholder="1"
              className="mt-2"
              data-testid="input-per-user-usage-limit"
            />
            {form.formState.errors.perUserUsageLimit && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.perUserUsageLimit.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="influencerId">Assign to Influencer</Label>
          <Select
            value={form.watch("influencerId") || "none"}
            onValueChange={(value) =>
              form.setValue("influencerId", value === "none" ? "" : value)
            }
          >
            <SelectTrigger className="mt-2" data-testid="select-influencer">
              <SelectValue placeholder="Select an influencer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No influencer</SelectItem>
              {influencers?.map((influencer) => (
                <SelectItem key={influencer.id} value={influencer.id}>
                  {influencer.name} {influencer.email ? `(${influencer.email})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.influencerId && (
            <p className="text-sm text-red-600 mt-1">{form.formState.errors.influencerId.message}</p>
          )}
        </div>

        {hasInfluencer && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="commissionType">Commission Type *</Label>
              <Select
                value={commissionType || ""}
                onValueChange={(value) => form.setValue("commissionType", value as "percentage" | "flat")}
              >
                <SelectTrigger className="mt-2" data-testid="select-commission-type">
                  <SelectValue placeholder="Select commission type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of order value</SelectItem>
                  <SelectItem value="flat">Flat amount per order</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.commissionType && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.commissionType.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="commissionValue">
                Commission Value * {commissionType === "percentage" ? "(%)" : "(₹)"}
              </Label>
              <Input
                id="commissionValue"
                {...form.register("commissionValue")}
                placeholder={commissionType === "percentage" ? "10" : "50"}
                className="mt-2"
                data-testid="input-commission-value"
              />
              {form.formState.errors.commissionValue && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.commissionValue.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Percentage commissions are calculated on the order value before shipping and taxes.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              {...form.register("startDate")}
              className="mt-2"
              data-testid="input-start-date"
            />
          </div>

          <div>
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              {...form.register("endDate")}
              className="mt-2"
              data-testid="input-end-date"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={form.watch("isActive")}
            onCheckedChange={(checked) => form.setValue("isActive", checked)}
            data-testid="switch-offer-active"
          />
          <Label htmlFor="isActive">Active</Label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          data-testid="button-cancel-offer"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={createOfferMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="button-save-offer"
        >
          {createOfferMutation.isPending ? "Saving..." : (offer ? "Update Offer" : "Create Offer")}
        </Button>
      </div>
    </form>
  );
}
