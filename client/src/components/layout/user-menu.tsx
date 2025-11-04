import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoginModal from "@/components/auth/login-modal";
import { User, LogOut, Package, FileText } from "lucide-react";
import { Link } from "wouter";

export default function UserMenu() {
  const [, setLocation] = useLocation();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { data: authData } = useQuery<{ authenticated: boolean; user?: any }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      return await response.json();
    },
    onSuccess: () => {
      // Immediately clear cache data to show logged out state
      queryClient.setQueryData(["/api/auth/me"], { authenticated: false });
      queryClient.removeQueries({ queryKey: ["/api/auth/orders"] });
      queryClient.removeQueries({ queryKey: ["/api/cart"] });
      // Also invalidate to ensure fresh data on next load
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/");
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isAuthenticated = authData?.authenticated;
  const user = authData?.user;

  if (!isAuthenticated) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLoginModal(true)}
          className="flex items-center gap-2"
          noWrap
          data-testid="button-login"
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Login</span>
        </Button>
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => {
            setShowLoginModal(false);
          }}
        />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          data-testid="button-user-menu"
          noWrap
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{user?.name || user?.phone || 'User'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-2 text-sm">
          <div className="font-medium">{user?.name || 'User'}</div>
          <div className="text-gray-500 text-xs">{user?.phone}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setLocation("/orders")}
          className="cursor-pointer"
          data-testid="menu-my-orders"
        >
          <Package className="mr-2 h-4 w-4" />
          My Orders
        </DropdownMenuItem>
        <DropdownMenuSeparator className="md:hidden" />
        <DropdownMenuItem
          onClick={() => setLocation("/terms-of-service")}
          className="cursor-pointer md:hidden"
          data-testid="menu-terms-of-service"
        >
          <FileText className="mr-2 h-4 w-4" />
          Terms of Service
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocation("/refund-policy")}
          className="cursor-pointer md:hidden"
          data-testid="menu-refund-policy"
        >
          <FileText className="mr-2 h-4 w-4" />
          Refund Policy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-red-600"
          data-testid="menu-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}