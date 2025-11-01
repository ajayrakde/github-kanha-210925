import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { generateUpiQrDataUrl } from "@/lib/upi-qr";

export type UpiWidgetStatus = "awaiting" | "success" | "failed" | "expired";

export interface PhonePeTokenUrlData {
  tokenUrl: string;
  paymentId?: string;
  merchantTransactionId?: string;
  expiresAt?: string;
}

export interface CashfreePaymentData {
  paymentId?: string;
  providerData?: {
    paymentSessionId?: string;
    checkoutUrl?: string;
    paymentLink?: string;
    merchantTransactionId?: string;
    upiLink?: string;
  } | null;
}

export interface UpiMerchantMetadata {
  name?: string;
  vpa?: string;
  code?: string;
  transactionNote?: string;
}

type PhonePeMutationResult = UseMutationResult<Partial<PhonePeTokenUrlData> | undefined, unknown, void, unknown>;
type CashfreeMutationResult = UseMutationResult<CashfreePaymentData | undefined, unknown, void, unknown>;

export interface UseUpiPaymentStateParams {
  amount: number | string | null | undefined;
  currency?: string;
  merchant?: UpiMerchantMetadata;
  phonePeMutation: PhonePeMutationResult;
  cashfreeMutation?: CashfreeMutationResult;
}

const EXPIRED_ERROR_CODES = new Set([
  "EXPIRED",
  "TOKEN_EXPIRED",
  "TOKEN_URL_EXPIRED",
  "TOKEN_EXPIRED_BEFORE_USE",
  "PAYMENT_EXPIRED",
  "PAYMENT_TIMEOUT",
  "TIMEDOUT",
  "TIMED_OUT",
]);

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192" role="img" aria-label="UPI QR placeholder">
  <defs>
    <linearGradient id="pulse" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e5e7eb">
        <animate attributeName="stop-color" values="#e5e7eb;#f3f4f6;#e5e7eb" dur="1.5s" repeatCount="indefinite" />
      </stop>
      <stop offset="100%" stop-color="#e5e7eb" />
    </linearGradient>
  </defs>
  <rect width="192" height="192" rx="16" fill="url(#pulse)" />
  <g font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" fill="#9ca3af">
    <text x="50%" y="50%" font-size="20" text-anchor="middle" dominant-baseline="middle">UPI QR</text>
  </g>
</svg>`;

export const UPI_QR_PLACEHOLDER_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

interface CachedQr {
  source?: string;
  dataUrl: string;
}

export interface UseUpiPaymentStateResult {
  upiUrl?: string;
  upiQrDataUrl: string;
  isQrPlaceholder: boolean;
  widgetStatus: UpiWidgetStatus;
  setWidgetStatus: React.Dispatch<React.SetStateAction<UpiWidgetStatus>>;
  applyGatewayStatus: (status?: string | null, errorCode?: string | null) => UpiWidgetStatus;
  copyUpiUrl: () => Promise<boolean>;
  copyCheckoutUrl: () => Promise<boolean>;
  shareableCheckoutUrl?: string;
  merchantTransactionId?: string;
}

const normalizeAmount = (amount: number | string | null | undefined): number | undefined => {
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
    return amount;
  }

  if (typeof amount === "string") {
    const parsed = Number.parseFloat(amount);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const buildUpiUrl = (
  amount: number | undefined,
  currency: string | undefined,
  merchant: UpiMerchantMetadata | undefined,
  merchantTransactionId: string | undefined,
): string | undefined => {
  if (!merchant?.vpa) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("pa", merchant.vpa);

  if (merchant?.name) {
    params.set("pn", merchant.name);
  }

  if (merchant?.code) {
    params.set("mc", merchant.code);
  }

  if (merchant?.transactionNote) {
    params.set("tn", merchant.transactionNote);
  }

  const normalizedAmount = amount;
  if (normalizedAmount && Number.isFinite(normalizedAmount)) {
    params.set("am", normalizedAmount.toFixed(2));
  }

  const normalizedCurrency = typeof currency === "string" && currency.trim().length > 0
    ? currency.trim().toUpperCase()
    : undefined;
  params.set("cu", normalizedCurrency ?? "INR");

  if (merchantTransactionId) {
    params.set("tr", merchantTransactionId);
  }

  return `upi://pay?${params.toString()}`;
};

const mapGatewayStatus = (status?: string | null, errorCode?: string | null): UpiWidgetStatus => {
  const normalizedStatus = typeof status === "string" ? status.toUpperCase() : undefined;
  const normalizedCode = typeof errorCode === "string" ? errorCode.toUpperCase() : undefined;

  switch (normalizedStatus) {
    case "COMPLETED":
      return "success";
    case "FAILED":
    case "CANCELLED": {
      if (normalizedCode && EXPIRED_ERROR_CODES.has(normalizedCode)) {
        return "expired";
      }
      return "failed";
    }
    case "PENDING":
    default:
      return "awaiting";
  }
};

export const useUpiPaymentState = (
  params: UseUpiPaymentStateParams,
): UseUpiPaymentStateResult => {
  const { amount, currency, merchant, phonePeMutation, cashfreeMutation } = params;
  const [widgetStatus, setWidgetStatus] = useState<UpiWidgetStatus>("awaiting");
  const [qrState, setQrState] = useState<CachedQr>({ dataUrl: UPI_QR_PLACEHOLDER_DATA_URL });

  const phonePeData = phonePeMutation.data;
  const cashfreeData = cashfreeMutation?.data;

  const merchantTransactionId = useMemo(() => {
    const phonePeId = typeof phonePeData?.merchantTransactionId === "string" && phonePeData.merchantTransactionId.trim().length > 0
      ? phonePeData.merchantTransactionId.trim()
      : undefined;

    const cashfreeProviderId = typeof cashfreeData?.providerData?.merchantTransactionId === "string"
      && cashfreeData.providerData?.merchantTransactionId?.trim().length
      ? cashfreeData.providerData.merchantTransactionId.trim()
      : undefined;

    return phonePeId ?? cashfreeProviderId;
  }, [phonePeData?.merchantTransactionId, cashfreeData?.providerData?.merchantTransactionId]);

  const normalizedAmount = useMemo(() => normalizeAmount(amount), [amount]);

  const upiUrl = useMemo(() => buildUpiUrl(normalizedAmount, currency, merchant, merchantTransactionId), [
    normalizedAmount,
    currency,
    merchant?.vpa,
    merchant?.name,
    merchant?.code,
    merchant?.transactionNote,
    merchantTransactionId,
  ]);

  const shareableCheckoutUrl = useMemo(() => {
    const phonePeUrl = typeof phonePeData?.tokenUrl === "string" ? phonePeData.tokenUrl : undefined;
    const cashfreeCheckoutUrl = typeof cashfreeData?.providerData?.checkoutUrl === "string"
      ? cashfreeData.providerData.checkoutUrl
      : undefined;
    const cashfreePaymentLink = typeof cashfreeData?.providerData?.paymentLink === "string"
      ? cashfreeData.providerData.paymentLink
      : undefined;
    const cashfreeUpiLink = typeof cashfreeData?.providerData?.upiLink === "string"
      ? cashfreeData.providerData.upiLink
      : undefined;

    return phonePeUrl ?? cashfreeCheckoutUrl ?? cashfreePaymentLink ?? cashfreeUpiLink;
  }, [
    phonePeData?.tokenUrl,
    cashfreeData?.providerData?.checkoutUrl,
    cashfreeData?.providerData?.paymentLink,
    cashfreeData?.providerData?.upiLink,
  ]);

  const lastMerchantTransactionId = useRef<string | undefined>();
  useEffect(() => {
    if (merchantTransactionId && merchantTransactionId !== lastMerchantTransactionId.current) {
      lastMerchantTransactionId.current = merchantTransactionId;
      setWidgetStatus("awaiting");
    }
  }, [merchantTransactionId]);

  useEffect(() => {
    let isCancelled = false;

    const generateQr = async () => {
      if (!upiUrl) {
        setQrState({ dataUrl: UPI_QR_PLACEHOLDER_DATA_URL });
        return;
      }

      if (qrState.source === upiUrl && qrState.dataUrl) {
        return;
      }

      const dataUrl = await generateUpiQrDataUrl(upiUrl);

      if (!isCancelled) {
        if (dataUrl) {
          setQrState({ source: upiUrl, dataUrl });
        } else {
          setQrState({ dataUrl: UPI_QR_PLACEHOLDER_DATA_URL });
        }
      }
    };

    void generateQr();

    return () => {
      isCancelled = true;
    };
  }, [upiUrl, qrState.source, qrState.dataUrl]);

  const copyToClipboard = useCallback(async (value?: string): Promise<boolean> => {
    if (!value) {
      return false;
    }

    const clipboard = globalThis?.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      return false;
    }

    try {
      await clipboard.writeText(value);
      return true;
    } catch (error) {
      console.warn("Clipboard write failed", error);
      return false;
    }
  }, []);

  const copyUpiUrl = useCallback(async () => copyToClipboard(upiUrl), [copyToClipboard, upiUrl]);
  const copyCheckoutUrl = useCallback(async () => copyToClipboard(shareableCheckoutUrl), [copyToClipboard, shareableCheckoutUrl]);

  const applyGatewayStatus = useCallback((status?: string | null, errorCode?: string | null) => {
    const next = mapGatewayStatus(status, errorCode);
    setWidgetStatus(next);
    return next;
  }, []);

  return {
    upiUrl,
    upiQrDataUrl: qrState.dataUrl,
    isQrPlaceholder: qrState.dataUrl === UPI_QR_PLACEHOLDER_DATA_URL,
    widgetStatus,
    setWidgetStatus,
    applyGatewayStatus,
    copyUpiUrl,
    copyCheckoutUrl,
    shareableCheckoutUrl,
    merchantTransactionId,
  };
};

export default useUpiPaymentState;
