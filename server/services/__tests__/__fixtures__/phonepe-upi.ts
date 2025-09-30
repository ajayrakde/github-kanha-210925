import type { PaymentResult, WebhookVerifyResult } from "../../../../shared/payment-types";

const now = new Date();

export const phonePeCreatePayment: PaymentResult = {
  paymentId: "pay_test_123",
  providerPaymentId: "pg_payment_123",
  providerOrderId: "order_pg_123",
  status: "created",
  amount: 49900,
  currency: "INR",
  provider: "phonepe",
  environment: "test",
  createdAt: now,
  updatedAt: now,
  method: { type: "upi" },
  providerData: {
    merchantTransactionId: "MERCHANT_TXN_123",
    transactionId: "PG_TXN_123",
    payerVpa: "buyer@upi",
  },
};

export const phonePeImmediateCapture: PaymentResult = {
  ...phonePeCreatePayment,
  status: "captured",
  amount: 49900,
  providerData: {
    ...phonePeCreatePayment.providerData,
    utr: "UTR1234567",
    receiptUrl: "https://phonepe.example/receipt/pay_test_123",
  },
};

export const phonePeWebhookCaptured: WebhookVerifyResult = {
  verified: true,
  event: {
    type: "payment.captured",
    paymentId: "pay_test_123",
    status: "captured",
    data: {
      merchantTransactionId: "MERCHANT_TXN_123",
      providerTransactionId: "PG_TXN_123",
      amount: "499.00",
      amountMinor: 49900,
      payerHandle: "buyer@upi",
      utr: "UTR1234567",
      receiptUrl: "https://phonepe.example/receipt/pay_test_123",
    },
  },
};

export const phonePeWebhookCancelled: WebhookVerifyResult = {
  verified: true,
  event: {
    type: "payment.cancelled",
    paymentId: "pay_test_123",
    status: "timed_out" as any,
    data: {
      reason: "USER_TIMEOUT",
      merchantTransactionId: "MERCHANT_TXN_123",
    },
  },
};

export const phonePeWebhookExpired: WebhookVerifyResult = {
  verified: true,
  event: {
    type: "payment.expired",
    paymentId: "pay_test_123",
    status: "expired" as any,
    data: {
      reason: "UPI_EXPIRED",
      merchantTransactionId: "MERCHANT_TXN_123",
    },
  },
};

export const phonePeWebhookTamperedAmount: WebhookVerifyResult = {
  verified: true,
  event: {
    type: "payment.captured",
    paymentId: "pay_test_123",
    status: "captured",
    data: {
      merchantTransactionId: "MERCHANT_TXN_123",
      providerTransactionId: "PG_TXN_123",
      amount: "999.00",
      amountMinor: 99900,
      utr: "UTR1234567",
      payerVpa: "buyer@upi",
    },
  },
};

export const phonePeWebhookReplayPayload = {
  eventId: "evt_replay_123",
  data: {
    transactionId: "PG_TXN_123",
  },
};

export const phonePeStatusPayload = {
  data: {
    statusResponse: {
      data: {
        state: "COMPLETED",
        utr: "UTR1234567",
      },
    },
  },
};
