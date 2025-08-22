import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function TermsOfService() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => setLocation("/")}
          className="mb-4"
          data-testid="button-back-home"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Back to Home
        </Button>
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Product Usage</h2>
          <div className="space-y-3 text-gray-700">
            <p>• Our products are <strong>nutritional food mixes</strong> meant for kids (2+ years) and families.</p>
            <p>• They are <strong>not a substitute for medical advice</strong>. Please consult a doctor if your child has allergies or health conditions.</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Orders & Payments</h2>
          <div className="space-y-3 text-gray-700">
            <p>• All prices are in INR (₹) and inclusive of applicable taxes unless otherwise specified.</p>
            <p>• Orders are confirmed only after successful payment.</p>
            <p>• <strong>Orders once placed cannot be cancelled.</strong></p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Shipping & Delivery</h2>
          <div className="space-y-3 text-gray-700">
            <p>• We deliver pan-India via trusted courier partners.</p>
            <p>• Delivery timelines are estimates. Delays due to logistics or unforeseen factors are not our responsibility.</p>
            <p>• <strong>Customers must track messages/WhatsApp/call communication from the courier and be available on the day of delivery. Please ensure to pick up calls from the delivery agent.</strong></p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Liability</h2>
          <div className="space-y-3 text-gray-700">
            <p>• While we ensure strict quality checks, we are <strong>not liable for misuse, allergic reactions, or results outside our control</strong>.</p>
            <p>• Our liability is limited to the amount paid for the product.</p>
          </div>
        </section>
      </div>
    </div>
  );
}