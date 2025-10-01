export const phonePeIdentifierFixture = {
  vpa: "buyer@upi",
  utr: "UTR1234567",
  maskedVpa: "bu***@upi",
  maskedUtr: "******4567",
  variant: "UPI_COLLECT",
  label: "UPI Collect",
};

export const phonePeLogFixture = {
  raw: {
    provider: "phonepe" as const,
    upiPayerHandle: "buyer@upi",
    upiUtr: "UTR1234567",
  },
  sanitized: {
    provider: "phonepe" as const,
    upiPayerHandle: "bu***@upi",
    upiUtr: "******4567",
  },
};
