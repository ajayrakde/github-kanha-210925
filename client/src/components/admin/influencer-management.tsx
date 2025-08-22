import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function InfluencerManagement() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "" });
  const [resetPassword, setResetPassword] = useState<{id: string, name: string} | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: influencers, isLoading } = useQuery({
    queryKey: ["/api/admin/influencers"],
  });

  const createInfluencerMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; email: string }) => {
      const response = await fetch("/api/admin/influencers", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error('Failed to create influencer');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      toast({
        title: "Influencer Created",
        description: `Login credentials: Phone: ${data.influencer.phone}, Password: ${data.password}`,
      });
      setShowAddForm(false);
      setFormData({ name: "", phone: "", email: "" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create influencer",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/influencers/${id}/reset-password`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error('Failed to reset password');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password Reset",
        description: `New password for ${data.influencer.name}: ${data.password}`,
      });
      setResetPassword(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast({
        title: "Error",
        description: "Name and phone number are required",
        variant: "destructive",
      });
      return;
    }
    createInfluencerMutation.mutate(formData);
  };

  if (isLoading) {
    return <div>Loading influencers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Influencer Management</h3>
        <Button onClick={() => setShowAddForm(true)} data-testid="button-add-influencer">
          <i className="fas fa-plus mr-2"></i>
          Add Influencer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.isArray(influencers) && influencers.map((influencer: any) => (
          <Card key={influencer.id} className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex justify-between items-center">
                <span>{influencer.name}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  influencer.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {influencer.isActive ? 'Active' : 'Inactive'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Phone:</span>
                  <span className="ml-2 font-mono">{influencer.phone}</span>
                </div>
                {influencer.email && (
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <span className="ml-2">{influencer.email}</span>
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResetPassword({id: influencer.id, name: influencer.name})}
                    data-testid={`button-reset-password-${influencer.id}`}
                  >
                    <i className="fas fa-key mr-1"></i>
                    Reset Password
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Influencer Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Influencer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-influencer-name"
                required
              />
            </div>
            <div>
              <Input
                type="tel"
                placeholder="Phone Number (will be username)"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="input-influencer-phone"
                required
              />
            </div>
            <div>
              <Input
                type="email"
                placeholder="Email (optional)"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-influencer-email"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createInfluencerMutation.isPending}
                data-testid="button-create-influencer"
              >
                {createInfluencerMutation.isPending ? "Creating..." : "Create Influencer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation */}
      <Dialog open={!!resetPassword} onOpenChange={() => setResetPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to reset the password for <strong>{resetPassword?.name}</strong>?</p>
            <p className="text-sm text-gray-600">A new password will be automatically generated.</p>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPassword(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => resetPassword && resetPasswordMutation.mutate(resetPassword.id)}
                disabled={resetPasswordMutation.isPending}
                data-testid="button-confirm-reset-password"
              >
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}