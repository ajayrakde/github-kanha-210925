import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
          <Link
            href="/terms-of-service"
            className="rounded hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
            data-testid="link-terms-of-service"
          >
            Terms of service
          </Link>
          <span>•</span>
          <Link
            href="/refund-policy"
            className="rounded hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
            data-testid="link-refund-policy"
          >
            Refund Return cancellation policy
          </Link>
          <span>•</span>
          <Link
            href="/admin"
            className="rounded hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
            data-testid="button-admin"
          >
            Admin
          </Link>
          <span>•</span>
          <Link
            href="/influencer"
            className="rounded hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50"
            data-testid="button-influencer"
          >
            Influencer
          </Link>
          <span>•</span>
          <span>contact: +919890894335/support@kanhaa.com</span>
        </div>
      </div>
    </footer>
  );
}