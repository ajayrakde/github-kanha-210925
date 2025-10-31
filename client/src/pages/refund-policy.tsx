import { Link } from "wouter";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RefundPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "-ml-2 text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:hover:text-white"
          )}
          data-testid="button-back-home"
        >
          <i className="fas fa-arrow-left mr-2" aria-hidden="true"></i>
          Back to Home
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Return / Refund / Cancellation Policy</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Non-Returnable Products</h2>
          <div className="space-y-3 text-gray-700">
            <p>• <strong>All products are strictly non-returnable and non-cancellable once ordered.</strong></p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Refund Eligibility</h2>
          <div className="space-y-3 text-gray-700">
            <p>Refunds are provided <strong>only in the following cases</strong>:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li>You received a <strong>damaged product</strong>,</li>
              <li>You received a <strong>defective product</strong>, or</li>
              <li>You received a <strong>wrong item</strong>.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Process</h2>
          <div className="space-y-3 text-gray-700">
            <p>In case of damage/defect/wrong item, please:</p>
            <ul className="list-disc list-inside ml-4 space-y-2">
              <li><strong>Accept the delivery</strong> (do not refuse or return it).</li>
              <li>Raise a refund request on the <strong>same day of delivery</strong>.</li>
              <li>Share <strong>photos/videos of the issue</strong> with your order ID via email at <strong>support@kanhaa.com</strong>.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Refund Approval & Timeline</h2>
          <div className="space-y-3 text-gray-700">
            <p>• After verification, we will process your refund in a <strong>minimum of 3 working days or at the earliest possible time</strong>.</p>
            <p>• Refunds will be credited to the original payment method.</p>
            <p>• Replacement items are <strong>not sent</strong>; refunds will be issued instead.</p>
          </div>
        </section>
      </div>
    </div>
  );
}