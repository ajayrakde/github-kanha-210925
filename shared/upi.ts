import type { PaymentProvider } from "./payment-providers";

const MASK_CHARACTER = "*";

const isMasked = (value: string): boolean => value.includes(MASK_CHARACTER);

const coerceString = (value?: string | null): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const maskPhonePeVirtualPaymentAddress = (
  value?: string | null
): string | undefined => {
  const normalized = coerceString(value);
  if (!normalized) {
    return undefined;
  }

  if (isMasked(normalized)) {
    return normalized;
  }

  const [localPart, domain] = normalized.split("@");
  if (!domain) {
    const visible = normalized.slice(0, Math.min(2, normalized.length));
    const maskedLength = Math.max(normalized.length - visible.length, 3);
    return `${visible}${MASK_CHARACTER.repeat(maskedLength)}`;
  }

  const visible = localPart.slice(0, Math.min(2, localPart.length));
  const maskedLength = Math.max(localPart.length - visible.length, 3);
  const maskedLocal = `${visible}${MASK_CHARACTER.repeat(maskedLength)}`;
  return `${maskedLocal}@${domain}`;
};

export const maskPhonePeUtr = (value?: string | null): string | undefined => {
  const normalized = coerceString(value);
  if (!normalized) {
    return undefined;
  }

  if (isMasked(normalized)) {
    return normalized;
  }

  if (normalized.length <= 4) {
    return MASK_CHARACTER.repeat(normalized.length);
  }

  const suffix = normalized.slice(-4);
  const maskedLength = Math.max(normalized.length - suffix.length, 4);
  return `${MASK_CHARACTER.repeat(maskedLength)}${suffix}`;
};

export const normalizeUpiInstrumentVariant = (
  variant?: string | null
): string | undefined => {
  const normalized = coerceString(variant)?.toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("UPI") || normalized.includes("QR")) {
    return normalized;
  }

  return undefined;
};

export const formatUpiInstrumentVariantLabel = (
  variant?: string | null
): string | undefined => {
  const normalized = normalizeUpiInstrumentVariant(variant);
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "UPI_COLLECT":
      return "UPI Collect";
    case "UPI_INTENT":
      return "UPI Intent";
    case "UPI_QR":
      return "UPI QR";
    case "QR_CODE":
      return "Dynamic QR";
    default:
      return normalized
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
};

export const maskPhonePeIdentifier = (
  provider: PaymentProvider | undefined,
  identifier: string | null | undefined,
  options: { type: "vpa" | "utr" }
): string | undefined => {
  if (provider !== "phonepe") {
    return coerceString(identifier);
  }

  return options.type === "vpa"
    ? maskPhonePeVirtualPaymentAddress(identifier)
    : maskPhonePeUtr(identifier);
};

export const sanitizePhonePeLogIdentifiers = (payload: {
  provider?: PaymentProvider;
  upiPayerHandle?: string | null;
  upiUtr?: string | null;
}) => ({
  ...payload,
  upiPayerHandle: maskPhonePeIdentifier(payload.provider, payload.upiPayerHandle, {
    type: "vpa",
  }),
  upiUtr: maskPhonePeIdentifier(payload.provider, payload.upiUtr, { type: "utr" }),
});

