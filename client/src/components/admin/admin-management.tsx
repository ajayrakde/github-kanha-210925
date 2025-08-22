import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, UserX, Trash2, Settings } from "lucide-react";

interface Admin {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  username: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Influencer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function AdminManagement() {
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [showInfluencerDialog, setShowInfluencerDialog] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: "",
    phone: "",
    email: "",
    username: "",
    password: "",
  });
  const [influencerForm, setInfluencerForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch admins
  const { data: admins = [], isLoading: loadingAdmins } = useQuery<Admin[]>({
    queryKey: ["/api/admin/admins"],
  });

  // Fetch influencers
  const { data: influencers = [], isLoading: loadingInfluencers } = useQuery<Influencer[]>({
    queryKey: ["/api/admin/influencers"],
  });

  // Create admin mutation
  const createAdminMutation = useMutation({
    mutationFn: async (data: typeof adminForm) => {
      const response = await apiRequest("POST", "/api/admin/admins", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      setShowAdminDialog(false);
      setAdminForm({ name: "", phone: "", email: "", username: "", password: "" });
      toast({
        title: "Admin created",
        description: "New admin has been added successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create admin",
        variant: "destructive",
      });
    },
  });

  // Create influencer mutation
  const createInfluencerMutation = useMutation({
    mutationFn: async (data: typeof influencerForm) => {
      const response = await apiRequest("POST", "/api/admin/influencers", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      setShowInfluencerDialog(false);
      setInfluencerForm({ name: "", phone: "", email: "", password: "" });
      toast({
        title: "Influencer created",
        description: "New influencer has been added successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create influencer",
        variant: "destructive",
      });
    },
  });

  // Deactivate influencer mutation
  const deactivateInfluencerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/admin/influencers/${id}/deactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      toast({
        title: "Influencer deactivated",
        description: "Influencer has been deactivated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to deactivate influencer",
        variant: "destructive",
      });
    },
  });

  // Remove influencer mutation
  const removeInfluencerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/influencers/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      toast({
        title: "Influencer removed",
        description: "Influencer has been removed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove influencer",
        variant: "destructive",
      });
    },
  });

  // Remove admin mutation
  const removeAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/admins/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({
        title: "Admin removed",
        description: "Admin has been removed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove admin",
        variant: "destructive",
      });
    },
  });

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminForm.name || !adminForm.phone) {
      toast({
        title: "Error",
        description: "Name and phone are required",
        variant: "destructive",
      });
      return;
    }
    createAdminMutation.mutate(adminForm);
  };

  const handleCreateInfluencer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!influencerForm.name || !influencerForm.phone) {
      toast({
        title: "Error",
        description: "Name and phone are required",
        variant: "destructive",
      });
      return;
    }
    createInfluencerMutation.mutate(influencerForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">User Management</h2>
      </div>

      <Tabs defaultValue="admins" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="influencers">Influencers</TabsTrigger>
        </TabsList>

        <TabsContent value="admins" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Admins</h3>
            <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-admin">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Admin</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateAdmin} className="space-y-4">
                  <div>
                    <Label htmlFor="admin-name">Name *</Label>
                    <Input
                      id="admin-name"
                      value={adminForm.name}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter admin name"
                      data-testid="input-admin-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-phone">Phone *</Label>
                    <Input
                      id="admin-phone"
                      value={adminForm.phone}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                      data-testid="input-admin-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-email">Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email"
                      data-testid="input-admin-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-username">Username</Label>
                    <Input
                      id="admin-username"
                      value={adminForm.username}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="Enter username"
                      data-testid="input-admin-username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-password">Password</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter password"
                      data-testid="input-admin-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={createAdminMutation.isPending}
                    data-testid="button-save-admin"
                  >
                    {createAdminMutation.isPending ? "Creating..." : "Create Admin"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingAdmins ? (
            <div>Loading admins...</div>
          ) : (
            <div className="grid gap-4">
              {admins.map((admin: Admin) => (
                <Card key={admin.id} data-testid={`card-admin-${admin.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{admin.name}</h4>
                        <p className="text-sm text-muted-foreground">{admin.phone}</p>
                        {admin.email && <p className="text-sm text-muted-foreground">{admin.email}</p>}
                        {admin.username && <p className="text-sm text-muted-foreground">@{admin.username}</p>}
                        <p className="text-xs text-muted-foreground">
                          Status: {admin.isActive ? "Active" : "Inactive"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeAdminMutation.mutate(admin.id)}
                          disabled={removeAdminMutation.isPending}
                          data-testid={`button-remove-admin-${admin.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="influencers" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Manage Influencers</h3>
            <Dialog open={showInfluencerDialog} onOpenChange={setShowInfluencerDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-influencer">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Influencer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Influencer</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateInfluencer} className="space-y-4">
                  <div>
                    <Label htmlFor="influencer-name">Name *</Label>
                    <Input
                      id="influencer-name"
                      value={influencerForm.name}
                      onChange={(e) => setInfluencerForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter influencer name"
                      data-testid="input-influencer-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="influencer-phone">Phone *</Label>
                    <Input
                      id="influencer-phone"
                      value={influencerForm.phone}
                      onChange={(e) => setInfluencerForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                      data-testid="input-influencer-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="influencer-email">Email</Label>
                    <Input
                      id="influencer-email"
                      type="email"
                      value={influencerForm.email}
                      onChange={(e) => setInfluencerForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter email"
                      data-testid="input-influencer-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="influencer-password">Password</Label>
                    <Input
                      id="influencer-password"
                      type="password"
                      value={influencerForm.password}
                      onChange={(e) => setInfluencerForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter password"
                      data-testid="input-influencer-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={createInfluencerMutation.isPending}
                    data-testid="button-save-influencer"
                  >
                    {createInfluencerMutation.isPending ? "Creating..." : "Create Influencer"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingInfluencers ? (
            <div>Loading influencers...</div>
          ) : (
            <div className="grid gap-4">
              {influencers.map((influencer: Influencer) => (
                <Card key={influencer.id} data-testid={`card-influencer-${influencer.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{influencer.name}</h4>
                        <p className="text-sm text-muted-foreground">{influencer.phone}</p>
                        {influencer.email && <p className="text-sm text-muted-foreground">{influencer.email}</p>}
                        <p className="text-xs text-muted-foreground">
                          Status: {influencer.isActive ? "Active" : "Inactive"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateInfluencerMutation.mutate(influencer.id)}
                          disabled={deactivateInfluencerMutation.isPending || !influencer.isActive}
                          data-testid={`button-deactivate-influencer-${influencer.id}`}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeInfluencerMutation.mutate(influencer.id)}
                          disabled={removeInfluencerMutation.isPending}
                          data-testid={`button-remove-influencer-${influencer.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}