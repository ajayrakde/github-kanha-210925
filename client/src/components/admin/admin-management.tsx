import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

export default function AdminManagement() {
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: "",
    phone: "",
    email: "",
    username: "",
    password: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch admins
  const { data: admins = [], isLoading: loadingAdmins } = useQuery<Admin[]>({
    queryKey: ["/api/admin/admins"],
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

  // Deactivate admin mutation
  const deactivateAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiRequest("PATCH", `/api/admin/admins/${adminId}/deactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({
        title: "Admin deactivated",
        description: "Admin has been deactivated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to deactivate admin",
        variant: "destructive",
      });
    },
  });

  // Remove admin mutation
  const removeAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/admins/${adminId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({
        title: "Admin removed",
        description: "Admin has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove admin",
        variant: "destructive",
      });
    },
  });

  const handleCreateAdmin = () => {
    if (!adminForm.name || !adminForm.phone || !adminForm.password) {
      toast({
        title: "Error",
        description: "Name, phone and password are required",
        variant: "destructive",
      });
      return;
    }
    createAdminMutation.mutate(adminForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Admin User Management</h3>
          <p className="text-gray-600">Manage admin users who can access the dashboard</p>
        </div>
        <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Admin</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="admin-name">Name *</Label>
                <Input
                  id="admin-name"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  placeholder="Enter admin name"
                  data-testid="input-admin-name"
                />
              </div>
              <div>
                <Label htmlFor="admin-phone">Phone *</Label>
                <Input
                  id="admin-phone"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
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
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  placeholder="Enter email address"
                  data-testid="input-admin-email"
                />
              </div>
              <div>
                <Label htmlFor="admin-username">Username</Label>
                <Input
                  id="admin-username"
                  value={adminForm.username}
                  onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                  placeholder="Enter username"
                  data-testid="input-admin-username"
                />
              </div>
              <div>
                <Label htmlFor="admin-password">Password *</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  placeholder="Enter password"
                  data-testid="input-admin-password"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAdminDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateAdmin}
                  disabled={createAdminMutation.isPending}
                  data-testid="button-create-admin"
                >
                  {createAdminMutation.isPending ? "Creating..." : "Create Admin"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loadingAdmins ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-gray-200 animate-pulse rounded-lg h-32"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {admins.map((admin) => (
            <Card key={admin.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{admin.name}</CardTitle>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    admin.isActive 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {admin.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phone:</span>
                    <span className="font-medium">{admin.phone}</span>
                  </div>
                  {admin.email && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium truncate ml-2">{admin.email}</span>
                    </div>
                  )}
                  {admin.username && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Username:</span>
                      <span className="font-medium">{admin.username}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created:</span>
                    <span className="text-gray-500">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  {admin.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateAdminMutation.mutate(admin.id)}
                      disabled={deactivateAdminMutation.isPending}
                      data-testid={`button-deactivate-admin-${admin.id}`}
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      Deactivate
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeAdminMutation.mutate(admin.id)}
                    disabled={removeAdminMutation.isPending}
                    data-testid={`button-remove-admin-${admin.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}