import { toDataURL, type QRCodeToDataURLOptions } from "qrcode";

type UpiQrOptions = QRCodeToDataURLOptions;

const DEFAULT_QR_OPTIONS: UpiQrOptions = {
  errorCorrectionLevel: "M",
  margin: 1,
  scale: 6,
};

export const generateUpiQrDataUrl = async (
  upiUrl: string | undefined | null,
  options?: UpiQrOptions,
): Promise<string | undefined> => {
  if (!upiUrl) {
    return undefined;
  }

  try {
    return await toDataURL(upiUrl, {
      ...DEFAULT_QR_OPTIONS,
      ...options,
    });
  } catch (error) {
    console.warn("Failed to generate UPI QR code", error);
    return undefined;
  }
};

export const UPI_QR_DEFAULTS = Object.freeze({ ...DEFAULT_QR_OPTIONS });

export type { UpiQrOptions };
