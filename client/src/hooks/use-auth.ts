import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useAdminAuth() {
  const queryClient = useQueryClient();

  const { data: authStatus, isLoading } = useQuery({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      return apiRequest("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(credentials),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
    },
  });

  return {
    isAuthenticated: authStatus?.authenticated || false,
    isLoading,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    loginLoading: loginMutation.isPending,
    loginError: loginMutation.error,
  };
}

export function useInfluencerAuth() {
  const queryClient = useQueryClient();

  const { data: authStatus, isLoading } = useQuery({
    queryKey: ["/api/influencer/me"],
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      return apiRequest("/api/influencer/login", {
        method: "POST",
        body: JSON.stringify(credentials),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/influencer/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/influencer/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/influencer/me"] });
    },
  });

  return {
    isAuthenticated: authStatus?.authenticated || false,
    isLoading,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    loginLoading: loginMutation.isPending,
    loginError: loginMutation.error,
  };
}