import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { scrollToFormError } from "@/lib/scroll-utils";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(10, "Phone number is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
  userType: z.enum(["admin", "influencer"], { required_error: "User type is required" }),
});

type UserFormData = z.infer<typeof userSchema>;

interface Admin {
  id: string;
  name: string;
  phone: string;
  email: string | null;
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

export default function UserManagement() {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Admin | Influencer | null>(null);
  const [currentUserType, setCurrentUserType] = useState<"admin" | "influencer">("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      password: "",
      userType: "admin",
    },
  });

  // Fetch admins
  const { data: admins = [], isLoading: loadingAdmins } = useQuery<Admin[]>({
    queryKey: ["/api/admin/admins"],
  });

  // Fetch influencers
  const { data: influencers = [], isLoading: loadingInfluencers } = useQuery<Influencer[]>({
    queryKey: ["/api/influencers"],
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const endpoint = data.userType === "admin" ? "/api/admin/admins" : "/api/influencers";
      const payload = {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        password: data.password || undefined,
      };
      const response = await apiRequest("POST", endpoint, payload);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/influencers"] });
      handleFormClose();
      toast({
        title: `${variables.userType === "admin" ? "Admin" : "Influencer"} created`,
        description: `New ${variables.userType} has been added successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create user",
        variant: "destructive",
      });
    },
  });

  // Deactivate user mutation
  const deactivateUserMutation = useMutation({
    mutationFn: async ({ userId, userType }: { userId: string; userType: "admin" | "influencer" }) => {
      const endpoint = userType === "admin" 
        ? `/api/admin/admins/${userId}/deactivate`
        : `/api/influencers/${userId}/deactivate`;
      const response = await apiRequest("PATCH", endpoint);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      queryClient.invalidateQueries({ queryKey: ["/api/influencers"] });
      toast({
        title: `${variables.userType === "admin" ? "Admin" : "Influencer"} deactivated`,
        description: `${variables.userType === "admin" ? "Admin" : "Influencer"} has been deactivated successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to deactivate user",
        variant: "destructive",
      });
    },
  });

  const handleFormClose = () => {
    setShowForm(false);
    setEditingUser(null);
    form.reset();
  };

  const onSubmit = (data: UserFormData) => {
    createUserMutation.mutate(data);
  };

  const onError = (errors: any) => {
    scrollToFormError(errors);
  };

  const handleDeactivate = (user: Admin | Influencer, userType: "admin" | "influencer") => {
    if (confirm(`Are you sure you want to deactivate this ${userType}?`)) {
      deactivateUserMutation.mutate({ userId: user.id, userType });
    }
  };

  const currentData = currentUserType === "admin" ? admins : influencers;
  const isLoading = currentUserType === "admin" ? loadingAdmins : loadingInfluencers;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
          <p className="text-sm text-gray-600">Manage admins and influencers</p>
        </div>
        <Button 
          onClick={() => setShowForm(true)}
          data-testid="button-add-user"
        >
          <i className="fas fa-plus mr-2"></i>Add User
        </Button>
      </div>

      <Tabs value={currentUserType} onValueChange={(value) => setCurrentUserType(value as "admin" | "influencer")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="admin" data-testid="tab-admins">Admins</TabsTrigger>
          <TabsTrigger value="influencer" data-testid="tab-influencers">Influencers</TabsTrigger>
        </TabsList>

        <TabsContent value="admin" className="mt-6">
          <UserList 
            users={admins} 
            isLoading={loadingAdmins} 
            userType="admin"
            onDeactivate={handleDeactivate}
          />
        </TabsContent>

        <TabsContent value="influencer" className="mt-6">
          <UserList 
            users={influencers} 
            isLoading={loadingInfluencers} 
            userType="influencer"
            onDeactivate={handleDeactivate}
          />
        </TabsContent>
      </Tabs>

      {/* User Form Dialog */}
      <Dialog open={showForm} onOpenChange={handleFormClose}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" aria-describedby="user-form-description">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div id="user-form-description" className="sr-only">
            Form to add a new admin or influencer user to the system
          </div>
          <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-4">
            <div>
              <Label htmlFor="userType">User Type *</Label>
              <Select
                value={form.watch("userType")}
                onValueChange={(value) => form.setValue("userType", value as "admin" | "influencer")}
              >
                <SelectTrigger className="mt-2" data-testid="select-user-type">
                  <SelectValue placeholder="Select user type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="influencer">Influencer</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.userType && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.userType.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="Enter full name"
                className="mt-2"
                data-testid="input-user-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                placeholder="Enter phone number"
                className="mt-2"
                data-testid="input-user-phone"
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="Enter email address"
                className="mt-2"
                data-testid="input-user-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                placeholder="Enter password (optional)"
                className="mt-2"
                data-testid="input-user-password"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleFormClose}
                data-testid="button-cancel-user"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-save-user"
              >
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface UserListProps {
  users: (Admin | Influencer)[];
  isLoading: boolean;
  userType: "admin" | "influencer";
  onDeactivate: (user: Admin | Influencer, userType: "admin" | "influencer") => void;
}

function UserList({ users, isLoading, userType, onDeactivate }: UserListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="bg-white border rounded-lg p-4 space-y-3">
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-2">No {userType}s found</div>
        <div className="text-gray-400 text-sm">Create your first {userType} to get started</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {users.map((user) => (
        <div key={user.id} className="bg-white border rounded-lg p-4" data-testid={`card-${userType}-${user.id}`}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <h4 className="font-semibold text-gray-900" data-testid={`text-${userType}-name-${user.id}`}>
                {user.name}
              </h4>
              <p className="text-sm text-gray-600" data-testid={`text-${userType}-phone-${user.id}`}>
                {user.phone}
              </p>
              {user.email && (
                <p className="text-sm text-gray-600" data-testid={`text-${userType}-email-${user.id}`}>
                  {user.email}
                </p>
              )}
            </div>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                user.isActive
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
              data-testid={`status-${userType}-${user.id}`}
            >
              {user.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          
          <div className="text-xs text-gray-500 mb-3">
            Created: {new Date(user.createdAt).toLocaleDateString()}
          </div>
          
          <div className="flex space-x-2">
            {user.isActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDeactivate(user, userType)}
                className="text-red-600 hover:text-red-700"
                data-testid={`button-deactivate-${userType}-${user.id}`}
              >
                <i className="fas fa-user-slash mr-1"></i>
                Deactivate
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}