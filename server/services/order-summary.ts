import type { Currency, PaymentStatus, RefundStatus } from "../../shared/payment-types";

interface OrderRecord {
  id: string;
  status: string;
  total: string | null;
  amountMinor: number;
  currency: Currency;
  createdAt: Date;
  updatedAt: Date;
  paymentMethod?: string | null;
}

interface PaymentRecord {
  id: string;
  provider: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  status: PaymentStatus;
  amountAuthorizedMinor: number | null;
  amountCapturedMinor: number | null;
  currency: Currency;
  methodKind: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

interface RefundRecord {
  amountMinor: number;
  status: RefundStatus;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface OrderPaymentSummary {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    total: string;
    createdAt: string;
    updatedAt: string;
  };
  transactions: Array<{
    id: string;
    status: PaymentStatus;
    amount: string;
    merchantTransactionId: string;
    provider: string;
    createdAt: string;
    updatedAt: string;
  }>;
  latestTransaction?: {
    id: string;
    status: PaymentStatus;
    amount: string;
    merchantTransactionId: string;
    provider: string;
    createdAt: string;
    updatedAt: string;
  };
  totalPaid: number;
  totalRefunded: number;
}

export function buildOrderPaymentSummary(
  order: OrderRecord,
  payments: PaymentRecord[],
  refunds: RefundRecord[]
): OrderPaymentSummary {
  const sortedPayments = [...payments].sort((a, b) => {
    const aDate = a.updatedAt ?? a.createdAt;
    const bDate = b.updatedAt ?? b.createdAt;
    return bDate.getTime() - aDate.getTime();
  });

  const latestPayment = sortedPayments[0];

  const paymentStatus = deriveOrderPaymentStatus(sortedPayments.map(payment => payment.status));

  const paymentMethod = (latestPayment?.methodKind ?? order.paymentMethod ?? latestPayment?.provider ?? "upi").toString();

  const transactions = sortedPayments.map(payment => {
    const amountMinor = payment.amountCapturedMinor ?? payment.amountAuthorizedMinor ?? 0;
    return {
      id: payment.id,
      status: payment.status,
      amount: formatAmount(amountMinor, payment.currency),
      merchantTransactionId: payment.providerPaymentId ?? payment.providerOrderId ?? payment.id,
      provider: payment.provider,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: (payment.updatedAt ?? payment.createdAt).toISOString(),
    };
  });

  const totalPaidMinor = sortedPayments.reduce((sum, payment) => {
    if (['captured', 'partially_refunded', 'refunded'].includes(payment.status)) {
      const amount = payment.amountCapturedMinor ?? payment.amountAuthorizedMinor ?? 0;
      return sum + amount;
    }
    return sum;
  }, 0);

  const totalRefundedMinor = refunds.reduce((sum, refund) => {
    if (refund.status === 'completed') {
      return sum + refund.amountMinor;
    }
    return sum;
  }, 0);

  const orderTotal = resolveOrderTotal(order.total, order.amountMinor, order.currency);

  const latestTransaction = transactions[0];

  return {
    order: {
      id: order.id,
      status: order.status,
      paymentStatus,
      paymentMethod,
      total: orderTotal,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    },
    transactions,
    latestTransaction,
    totalPaid: toMajorUnits(totalPaidMinor),
    totalRefunded: toMajorUnits(totalRefundedMinor),
  };
}

function deriveOrderPaymentStatus(statuses: PaymentStatus[]): string {
  if (statuses.some(status => status === 'refunded')) {
    return 'refunded';
  }

  if (statuses.some(status => status === 'partially_refunded')) {
    return 'partially_refunded';
  }

  if (statuses.some(status => status === 'captured')) {
    return 'paid';
  }

  if (statuses.some(status => status === 'failed' || status === 'cancelled')) {
    return 'failed';
  }

  if (statuses.length > 0) {
    return 'pending';
  }

  return 'pending';
}

function formatAmount(amountMinor: number, _currency: Currency): string {
  return toMajorUnits(amountMinor).toFixed(2);
}

function toMajorUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

function resolveOrderTotal(total: string | null, amountMinor: number, currency: Currency): string {
  if (total) {
    return total;
  }

  const amount = formatAmount(amountMinor, currency);
  return amount;
}
