import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Footer() {
  const [location, setLocation] = useLocation();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Company Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">SimpleStore</h3>
            <p className="text-sm text-gray-600 mb-2">
              Quality nutritional food mixes for kids and families.
            </p>
            <p className="text-sm text-gray-600">
              Email: support@panchkosha.in
            </p>
          </div>

          {/* Legal Pages */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Legal</h3>
            <div className="space-y-2">
              <button
                onClick={() => setLocation("/terms-of-service")}
                className="block text-sm text-gray-600 hover:text-blue-600 transition-colors"
                data-testid="link-terms-of-service"
              >
                Terms of Service
              </button>
              <button
                onClick={() => setLocation("/refund-policy")}
                className="block text-sm text-gray-600 hover:text-blue-600 transition-colors"
                data-testid="link-refund-policy"
              >
                Refund/Return/Cancellation Policy
              </button>
            </div>
          </div>

          {/* Admin Access */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Access</h3>
            <div className="space-y-2">
              <Button
                variant={location === "/admin" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLocation("/admin")}
                className="block w-full justify-start"
                data-testid="button-admin"
              >
                Admin Panel
              </Button>
              <Button
                variant={location === "/influencer" ? "default" : "ghost"}
                size="sm"
                onClick={() => setLocation("/influencer")}
                className="block w-full justify-start"
                data-testid="button-influencer"
              >
                Influencer Dashboard
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-6 pt-4 text-center">
          <p className="text-sm text-gray-500">
            © 2024 SimpleStore. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}