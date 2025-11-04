import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Phone, Mail, MapPin } from "lucide-react";

interface UserData {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
}

export default function Profile() {
  const [, setLocation] = useLocation();

  const { data: authData, isLoading } = useQuery<{ authenticated: boolean; user?: UserData }>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="space-y-3 sm:space-y-6">
          <Button
            onClick={() => setLocation("/")}
            variant="ghost"
            className="mb-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-5 bg-gray-200 rounded w-32"></div>
                <div className="h-4 bg-gray-200 rounded w-48"></div>
                <div className="h-4 bg-gray-200 rounded w-64"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authData?.authenticated || !authData.user) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="text-center py-12 bg-white rounded border border-gray-200">
          <div className="text-6xl mb-2 sm:mb-4">👤</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Not logged in</h3>
          <p className="text-gray-600 mb-3 sm:mb-6">Please log in to view your profile</p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-home">
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  const user = authData.user;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4">
      <div className="space-y-3 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-6">
          <Button
            onClick={() => setLocation("/")}
            variant="ghost"
            className="text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
            data-testid="button-back-from-profile"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">My Profile</h2>
            <p className="text-gray-600 hidden sm:block">View and manage your account information</p>
          </div>
        </div>

        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
            <div className="space-y-4">
              {user.name && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="text-base font-medium text-gray-900" data-testid="profile-name">
                      {user.name}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Phone Number</p>
                  <p className="text-base font-medium text-gray-900" data-testid="profile-phone">
                    {user.phone}
                  </p>
                </div>
              </div>

              {user.email && (
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="text-base font-medium text-gray-900" data-testid="profile-email">
                      {user.email}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div id="addresses" className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Address Information</h3>
            {user.address || user.city || user.pincode ? (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Saved Address</p>
                  <p className="text-base font-medium text-gray-900" data-testid="profile-address">
                    {[user.address, user.city, user.pincode].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-600">No address information available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
