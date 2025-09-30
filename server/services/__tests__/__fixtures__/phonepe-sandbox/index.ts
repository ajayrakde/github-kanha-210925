export interface PhonePeSandboxResponse {
  success: boolean;
  code: string;
  message: string;
  data: {
    merchantId: string;
    merchantTransactionId: string;
    transactionId: string;
    amount: number;
    state: 'PENDING' | 'COMPLETED' | 'FAILED';
    responseCode: string;
    paymentInstrument: {
      type: string;
      utr?: string;
      vpa?: string;
      qrData?: string;
      qrExpiry?: string;
    };
  };
}

const baseData = {
  merchantId: 'MID123456789',
  merchantTransactionId: 'MERCHANT-TXN-001',
  transactionId: 'PHONEPE-TXN-001',
  amount: 12345,
};

export const sandboxUpiSuccess: PhonePeSandboxResponse = {
  success: true,
  code: 'PAYMENT_SUCCESS',
  message: 'Payment completed in sandbox',
  data: {
    ...baseData,
    state: 'COMPLETED',
    responseCode: 'SUCCESS',
    paymentInstrument: {
      type: 'UPI',
      utr: 'UTR-SANDBOX-0001',
      vpa: 'success@ybl',
    },
  },
};

export const sandboxUpiFailed: PhonePeSandboxResponse = {
  success: true,
  code: 'PAYMENT_DECLINED',
  message: 'The payer VPA is configured to fail in sandbox',
  data: {
    ...baseData,
    merchantTransactionId: 'MERCHANT-TXN-FAIL',
    transactionId: 'PHONEPE-TXN-FAIL',
    state: 'FAILED',
    responseCode: 'UPI_TXN_FAILED',
    paymentInstrument: {
      type: 'UPI',
      vpa: 'failed@ybl',
    },
  },
};

export const sandboxUpiPending: PhonePeSandboxResponse = {
  success: true,
  code: 'PAYMENT_PENDING',
  message: 'The payer has not yet approved the collect request',
  data: {
    ...baseData,
    merchantTransactionId: 'MERCHANT-TXN-PENDING',
    transactionId: 'PHONEPE-TXN-PENDING',
    state: 'PENDING',
    responseCode: 'PENDING',
    paymentInstrument: {
      type: 'UPI',
      vpa: 'pending@ybl',
    },
  },
};

export const sandboxDynamicQr: PhonePeSandboxResponse = {
  success: true,
  code: 'QR_GENERATED',
  message: 'QR code generated for sandbox checkout',
  data: {
    ...baseData,
    merchantTransactionId: 'MERCHANT-TXN-QR',
    transactionId: 'PHONEPE-TXN-QR',
    state: 'PENDING',
    responseCode: 'PENDING',
    paymentInstrument: {
      type: 'QR_CODE',
      qrData: 'upi://pay?pa=success@ybl&pn=Sandbox%20Merchant&am=123.45&cu=INR',
      qrExpiry: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
  },
};

export const sandboxDynamicQrCompleted: PhonePeSandboxResponse = {
  success: true,
  code: 'PAYMENT_SUCCESS',
  message: 'QR code payment completed',
  data: {
    ...baseData,
    merchantTransactionId: 'MERCHANT-TXN-QR',
    transactionId: 'PHONEPE-TXN-QR',
    state: 'COMPLETED',
    responseCode: 'SUCCESS',
    paymentInstrument: {
      type: 'UPI',
      utr: 'UTR-SANDBOX-QR-0001',
      vpa: 'success@ybl',
    },
  },
};
