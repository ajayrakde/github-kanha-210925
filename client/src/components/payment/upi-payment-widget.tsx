import { Fragment, useMemo } from "react";
import { Loader2, CreditCard, AlertCircle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";
import type { UseUpiPaymentStateReturn } from "@/hooks/use-upi-payment-state";

export type PhonePeInstrumentPreference = "UPI_INTENT" | "UPI_COLLECT" | "UPI_QR";

export interface UpiPaymentDetails {
  url?: string | null;
  rawUrl?: string | null;
  amount?: string | null;
  note?: string | null;
  merchantVpa?: string | null;
  merchantName?: string | null;
  qrData?: string | null;
  qrExpiresAt?: string | null;
  currency?: string | null;
}

interface InstrumentOption {
  value: PhonePeInstrumentPreference;
  label: string;
  description: string;
  testId: string;
}

const PHONEPE_INSTRUMENT_OPTIONS: InstrumentOption[] = [
  {
    value: "UPI_INTENT",
    label: "UPI Intent",
    description: "Launch your preferred UPI app to approve the payment",
    testId: "button-select-upi_intent",
  },
  {
    value: "UPI_COLLECT",
    label: "UPI Collect",
    description: "We send a collect request to your UPI app for approval",
    testId: "button-select-upi_collect",
  },
  {
    value: "UPI_QR",
    label: "UPI QR",
    description: "Scan a QR code from any UPI app to complete payment",
    testId: "button-select-upi_qr",
  },
];

export interface UpiPaymentWidgetProps {
  state: UseUpiPaymentStateReturn;
  paymentStatus: "pending" | "processing" | "completed" | "failed";
  instrumentPreference: PhonePeInstrumentPreference;
  onInstrumentPreferenceChange: (value: PhonePeInstrumentPreference) => void;
  onInitiatePhonePe: () => void;
  isInitiatingPhonePe: boolean;
  isLoading: boolean;
  upiDetails?: UpiPaymentDetails | null;
  onLaunchIntent?: () => void;
  onRetry: () => void;
  onBack: () => void;
  isCashfree: boolean;
  hasCashfreeCollectForm: boolean;
  amountDisplay?: string | null;
  fallbackCurrency?: string | null;
}

const STATUS_TITLE_MAP: Record<
  UpiPaymentWidgetProps["paymentStatus"],
  { title: string; description: string; icon: JSX.Element }
> = {
  pending: {
    title: "Ready to Pay",
    description: "Choose how you'd like to continue with UPI.",
    icon: <CreditCard className="h-8 w-8 text-blue-600" />,
  },
  processing: {
    title: "Processing Payment",
    description: "Please approve the request in your UPI app.",
    icon: <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />,
  },
  completed: {
    title: "Payment Successful!",
    description: "Your payment has been processed successfully. Redirecting...",
    icon: <CheckCircle2 className="h-8 w-8 text-green-600" />,
  },
  failed: {
    title: "Payment Failed",
    description: "Your payment could not be processed. Please try again.",
    icon: <AlertCircle className="h-8 w-8 text-red-600" />,
  },
};

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

const formatAmount = (amount?: string | null, fallbackCurrency?: string | null) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return formatter.format(0);
  }

  if (fallbackCurrency && fallbackCurrency.toUpperCase() !== "INR") {
    return `${fallbackCurrency} ${numeric.toFixed(2)}`;
  }

  return formatter.format(numeric);
};

function renderQrImage(upiDetails?: UpiPaymentDetails | null) {
  if (!upiDetails?.qrData) {
    return null;
  }

  const isLikelyBase64 = /^[A-Za-z0-9+/=]+$/.test(upiDetails.qrData.replace(/\s+/g, ""));
  const src = isLikelyBase64
    ? `data:image/png;base64,${upiDetails.qrData}`
    : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt="UPI QR code"
        className="mx-auto h-44 w-44 rounded border border-gray-200 bg-white p-3 shadow"
        data-testid="upi-qr-image"
      />
    );
  }

  return (
    <div className="rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600">
      <p className="font-medium">Scan this QR payload with any UPI app</p>
      <code className="mt-2 block break-all text-xs" data-testid="upi-qr-payload">
        {upiDetails.qrData}
      </code>
    </div>
  );
}

function IntentAction({ onLaunchIntent }: { onLaunchIntent?: () => void }) {
  if (!onLaunchIntent) {
    return null;
  }

  return (
    <Button
      type="button"
      onClick={onLaunchIntent}
      className="w-full"
      size="lg"
      data-testid="button-launch-upi-intent"
    >
      <ArrowUpRight className="mr-2 h-4 w-4" />
      Open UPI App
    </Button>
  );
}

export default function UpiPaymentWidget({
  state,
  paymentStatus,
  instrumentPreference,
  onInstrumentPreferenceChange,
  onInitiatePhonePe,
  isInitiatingPhonePe,
  isLoading,
  upiDetails,
  onLaunchIntent,
  onRetry,
  onBack,
  isCashfree,
  hasCashfreeCollectForm,
  amountDisplay,
  fallbackCurrency,
}: UpiPaymentWidgetProps) {
  const statusContent = STATUS_TITLE_MAP[paymentStatus];

  const canonicalAmount = useMemo(() => {
    if (upiDetails?.amount) {
      return formatAmount(upiDetails.amount, upiDetails.currency ?? fallbackCurrency ?? undefined);
    }
    if (amountDisplay) {
      return formatAmount(amountDisplay, fallbackCurrency ?? undefined);
    }
    return formatter.format(0);
  }, [amountDisplay, fallbackCurrency, upiDetails?.amount, upiDetails?.currency]);

  const merchantLine = upiDetails?.merchantName
    ?? upiDetails?.merchantVpa
    ?? "Your trusted merchant";

  const awaitingCopy = state.status === "awaiting"
    ? "Awaiting confirmation in your UPI app."
    : "";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 mx-auto">
          {statusContent.icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{statusContent.title}</h3>
        <p className="text-gray-600">
          {state.status === "awaiting" && paymentStatus !== "completed" && paymentStatus !== "failed"
            ? awaitingCopy || "Please approve the collect request in your UPI app."
            : statusContent.description}
        </p>
      </div>

      {!isCashfree && paymentStatus === "pending" && (
        <section className="space-y-3">
          <p className="text-sm font-medium text-gray-900">Choose how you want to pay with UPI</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PHONEPE_INSTRUMENT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={instrumentPreference === option.value ? "default" : "outline"}
                className="h-auto w-full flex-col items-start justify-start gap-1 py-3"
                onClick={() => onInstrumentPreferenceChange(option.value)}
                data-testid={option.testId}
                aria-pressed={instrumentPreference === option.value}
              >
                <span className="text-sm font-semibold text-gray-900">{option.label}</span>
                <span className="text-xs text-gray-500 text-left">{option.description}</span>
              </Button>
            ))}
          </div>
        </section>
      )}

      {upiDetails && paymentStatus !== "failed" && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Payment details</h4>
          <dl className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-gray-600">Amount</dt>
              <dd data-testid="upi-amount">{canonicalAmount}</dd>
            </div>
            {upiDetails.merchantName && (
              <div>
                <dt className="font-medium text-gray-600">Merchant</dt>
                <dd data-testid="upi-merchant-name">{upiDetails.merchantName}</dd>
              </div>
            )}
            {upiDetails.merchantVpa && (
              <div>
                <dt className="font-medium text-gray-600">Merchant VPA</dt>
                <dd data-testid="upi-merchant-vpa" className="break-all">{upiDetails.merchantVpa}</dd>
              </div>
            )}
            {upiDetails.note && (
              <div>
                <dt className="font-medium text-gray-600">Note</dt>
                <dd data-testid="upi-note" className="break-words">{upiDetails.note}</dd>
              </div>
            )}
            {!upiDetails.merchantName && !upiDetails.merchantVpa && (
              <div>
                <dt className="font-medium text-gray-600">Merchant</dt>
                <dd>{merchantLine}</dd>
              </div>
            )}
          </dl>

          {instrumentPreference === "UPI_QR" && renderQrImage(upiDetails)}

          {instrumentPreference === "UPI_INTENT" && (
            <div className="mt-4">
              <IntentAction onLaunchIntent={onLaunchIntent} />
            </div>
          )}
        </section>
      )}

      {paymentStatus === "pending" && !isCashfree && (
        <Button
          onClick={onInitiatePhonePe}
          disabled={isLoading || isInitiatingPhonePe}
          size="lg"
          className="w-full"
          data-testid="button-initiate-payment"
        >
          {isLoading || isInitiatingPhonePe ? (
            <Fragment>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Fragment>
          ) : (
            <Fragment>
              <CreditCard className="mr-2 h-4 w-4" />
              Continue to Payment
            </Fragment>
          )}
        </Button>
      )}

      {paymentStatus === "failed" && (
        <div className="space-y-3">
          <Button
            onClick={onRetry}
            disabled={isLoading}
            size="lg"
            className="w-full"
            data-testid="button-retry-payment"
          >
            {isLoading ? (
              <Fragment>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Retrying...
              </Fragment>
            ) : (
              <Fragment>
                <CreditCard className="mr-2 h-4 w-4" />
                Retry Payment
              </Fragment>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onBack}
            className="w-full"
            data-testid="button-back-to-checkout-failed"
          >
            Back
          </Button>
        </div>
      )}

      {paymentStatus === "completed" && (
        <CardDescription className="text-center text-sm text-gray-600">
          We'll redirect you to the thank-you page once everything is confirmed.
        </CardDescription>
      )}

      {isCashfree && !hasCashfreeCollectForm && paymentStatus === "pending" && (
        <Button
          onClick={onInitiatePhonePe}
          disabled={isLoading}
          size="lg"
          className="w-full"
          data-testid="button-initiate-payment"
        >
          {isLoading ? (
            <Fragment>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Fragment>
          ) : (
            <Fragment>
              <CreditCard className="mr-2 h-4 w-4" />
              Continue to Payment
            </Fragment>
          )}
        </Button>
      )}

      {isCashfree && hasCashfreeCollectForm && (
        <p className="text-xs text-gray-500 text-center">
          After you submit your UPI ID, we'll send a collect request to your app.
        </p>
      )}
    </div>
  );
}

export { PHONEPE_INSTRUMENT_OPTIONS };
