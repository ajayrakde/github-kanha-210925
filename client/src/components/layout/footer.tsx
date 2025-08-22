import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Footer() {
  const [location, setLocation] = useLocation();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
          <button
            onClick={() => setLocation("/terms-of-service")}
            className="hover:text-gray-700 transition-colors"
            data-testid="link-terms-of-service"
          >
            Terms of service
          </button>
          <span>•</span>
          <button
            onClick={() => setLocation("/refund-policy")}
            className="hover:text-gray-700 transition-colors"
            data-testid="link-refund-policy"
          >
            Refund Return cancellation policy
          </button>
          <span>•</span>
          <button
            onClick={() => setLocation("/admin")}
            className="hover:text-gray-700 transition-colors"
            data-testid="button-admin"
          >
            Admin
          </button>
          <span>•</span>
          <button
            onClick={() => setLocation("/influencer")}
            className="hover:text-gray-700 transition-colors"
            data-testid="button-influencer"
          >
            Influencer
          </button>
          <span>•</span>
          <span>contact: +919890894335/support@panchkosha.in</span>
        </div>
      </div>
    </footer>
  );
}