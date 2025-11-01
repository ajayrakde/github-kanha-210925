import { Button } from "@/components/ui/button";
import { PHONEPE_INSTRUMENT_OPTIONS, type PhonePeInstrumentPreference } from "@/lib/upi-payment";
import type { UpiWidgetStatus } from "@/hooks/use-upi-payment-state";
import { AlertCircle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface WidgetAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

interface SecondaryAction extends WidgetAction {
  variant?: "outline" | "ghost" | "default";
}

interface UpiPaymentWidgetProps {
  status: UpiWidgetStatus;
  amount?: number | null;
  merchantName?: string | null;
  merchantCity?: string | null;
  instrumentPreference: PhonePeInstrumentPreference;
  onInstrumentSelect: (preference: PhonePeInstrumentPreference) => void;
  primaryAction?: WidgetAction | null;
  retryAction?: WidgetAction | null;
  secondaryAction?: SecondaryAction | null;
  instrumentOptions?: typeof PHONEPE_INSTRUMENT_OPTIONS;
  isCashfree: boolean;
  hasCashfreeSession: boolean;
  additionalContent?: ReactNode;
}

const formatAmount = (amount?: number | null): string => {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "₹0.00";
  }
  return `₹${amount.toFixed(2)}`;
};

export function UpiPaymentWidget({
  status,
  amount,
  merchantName,
  merchantCity,
  instrumentPreference,
  onInstrumentSelect,
  primaryAction,
  retryAction,
  secondaryAction,
  instrumentOptions = PHONEPE_INSTRUMENT_OPTIONS,
  isCashfree,
  hasCashfreeSession,
  additionalContent,
}: UpiPaymentWidgetProps) {
  const amountDisplay = formatAmount(amount ?? null);
  const resolvedMerchant = merchantName?.trim();
  const resolvedMerchantCity = merchantCity?.trim();

  const renderPrimaryActionLabel = (action: WidgetAction) => {
    if (action.loading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      );
    }
    return (
      <>
        <CreditCard className="mr-2 h-4 w-4" />
        {action.label}
      </>
    );
  };

  const renderRetryActionLabel = (action: WidgetAction) => {
    if (action.loading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Retrying...
        </>
      );
    }
    return (
      <>
        <CreditCard className="mr-2 h-4 w-4" />
        {action.label}
      </>
    );
  };

  const awaitingDescription = isCashfree
    ? hasCashfreeSession
      ? "Enter your UPI ID to complete the payment."
      : "Click below to set up your payment."
    : "The PhonePe checkout will open in a secure iframe to complete your payment.";

  const contentByStatus: Record<UpiWidgetStatus, ReactNode> = {
    awaiting: (
      <div className="text-center py-6">
        <div className="mb-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Pay</h3>
          <p className="text-gray-600 mb-6">{awaitingDescription}</p>
        </div>
        {!isCashfree && instrumentOptions.length > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-sm font-medium text-gray-900">Choose how you want to pay with UPI</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {instrumentOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={instrumentPreference === option.value ? "default" : "outline"}
                  className="h-auto w-full flex-col items-start justify-start gap-1 py-3"
                  onClick={() => onInstrumentSelect(option.value)}
                  data-testid={option.testId}
                  aria-pressed={instrumentPreference === option.value}
                >
                  <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                  <span className="text-xs text-gray-500 text-left">{option.description}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        {primaryAction && (
          <Button
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            size="lg"
            className="w-full"
            data-testid={primaryAction.testId}
          >
            {renderPrimaryActionLabel(primaryAction)}
          </Button>
        )}
        {isCashfree && hasCashfreeSession && (
          <p className="mt-4 text-sm text-gray-500">Enter your UPI ID below to receive a collect request.</p>
        )}
      </div>
    ),
    processing: (
      <div className="text-center py-6">
        <div className="mb-4">
          <Loader2 className="h-16 w-16 text-blue-600 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Payment</h3>
          <p className="text-gray-600">Please complete the payment on the UPI payment page.</p>
        </div>
      </div>
    ),
    completed: (
      <div className="text-center py-6">
        <div className="mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Successful!</h3>
          <p className="text-gray-600">Your payment has been processed successfully. Redirecting...</p>
        </div>
      </div>
    ),
    failed: (
      <div className="text-center py-6">
        <div className="mb-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Payment Failed</h3>
          <p className="text-gray-600 mb-6">Your payment could not be processed. Please try again.</p>
        </div>
        <div className="space-y-3">
          {retryAction && (
            <Button
              onClick={retryAction.onClick}
              disabled={retryAction.disabled}
              size="lg"
              className="w-full"
              data-testid={retryAction.testId}
            >
              {renderRetryActionLabel(retryAction)}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant ?? "outline"}
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="w-full"
              data-testid={secondaryAction.testId}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </div>
    ),
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
        <p className="text-xs font-medium uppercase text-gray-500">Amount Payable</p>
        <p className="text-2xl font-semibold text-gray-900">{amountDisplay}</p>
        {resolvedMerchant && (
          <p className="text-sm text-gray-600">to {resolvedMerchant}</p>
        )}
        {resolvedMerchantCity && (
          <p className="text-xs text-gray-500">{resolvedMerchantCity}</p>
        )}
      </div>
      {contentByStatus[status]}
      {additionalContent ? <div className="pt-2">{additionalContent}</div> : null}
    </div>
  );
}
