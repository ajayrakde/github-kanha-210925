export type PhonePeInstrumentPreference = "UPI_INTENT" | "UPI_COLLECT" | "UPI_QR";

export const PHONEPE_INSTRUMENT_OPTIONS: Array<{
  value: PhonePeInstrumentPreference;
  label: string;
  description: string;
  testId: string;
}> = [
  {
    value: "UPI_INTENT",
    label: "UPI Intent",
    description: "Launches your preferred UPI app to approve the payment",
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
