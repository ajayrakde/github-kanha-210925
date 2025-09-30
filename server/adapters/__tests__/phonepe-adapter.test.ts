import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../services/config-resolver';
import { PhonePeAdapter } from '../phonepe-adapter';

const baseConfig: ResolvedConfig = {
  provider: 'phonepe',
  environment: 'test',
  enabled: true,
  tenantId: 'test-tenant',
  merchantId: 'MID123',
  saltIndex: 1,
  successUrl: 'https://merchant.example/success',
  failureUrl: 'https://merchant.example/failure',
  webhookUrl: 'https://merchant.example/webhook',
  secrets: {
    provider: 'phonepe',
    environment: 'test',
    environmentPrefix: 'PAYAPP_TEST_PHONEPE_',
    salt: 'test-salt',
    webhookSecret: 'wh-secret',
  },
  capabilities: {},
  metadata: {},
  isValid: true,
  missingSecrets: [],
  phonepeConfig: {
    client_id: 'client-id',
    client_secret: 'client-secret',
    client_version: '1.0.0',
    merchantId: 'MID123',
    webhookAuth: {
      username: 'user',
      password: 'pass',
    },
    redirectUrl: 'https://merchant.example/redirect',
    hosts: {
      uat: 'https://uat.phonepe.example',
      prod: 'https://prod.phonepe.example',
    },
  },
};

const buildFetchResponse = () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    success: true,
    code: 'SUCCESS',
    message: 'Payment created',
    data: {
      merchantTransactionId: 'merchant-txn',
      transactionId: 'txn',
      instrumentResponse: {
        type: 'UPI_COLLECT',
      },
    },
  }),
});

describe('PhonePeAdapter.createPayment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
  });

  const createAdapter = () => {
    const tokenManager = {
      getAccessToken: vi.fn().mockResolvedValue('cached-token'),
      invalidateToken: vi.fn(),
    };

    const fetchMock = vi.fn().mockResolvedValue(buildFetchResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new PhonePeAdapter(baseConfig, {
      tokenManager: tokenManager as any,
    });

    return { adapter, tokenManager, fetchMock };
  };

  it('serializes checkout payload with UPI-only instruments', async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.createPayment({
      orderId: 'order-1',
      orderAmount: 12345,
      currency: 'INR',
      customer: {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, fetchOptions] = fetchMock.mock.calls[0]!;

    const requestBody = JSON.parse(fetchOptions.body as string) as { request: string };
    const decodedPayload = JSON.parse(
      Buffer.from(requestBody.request, 'base64').toString('utf8')
    );

    expect(decodedPayload.amount).toBe(12345);
    expect(decodedPayload.paymentFlow).toEqual({ type: 'PG_CHECKOUT' });
    expect(decodedPayload.expireAfter).toBeGreaterThanOrEqual(300);
    expect(decodedPayload.expireAfter).toBeLessThanOrEqual(3600);

    expect(decodedPayload.paymentModeConfig.paymentModes).toHaveLength(1);
    const [upiMode] = decodedPayload.paymentModeConfig.paymentModes;
    expect(upiMode.paymentMode).toBe('UPI');

    const instrumentTypes = upiMode.paymentInstruments.map((instrument: any) => instrument.type).sort();
    expect(instrumentTypes).toEqual(['UPI_COLLECT', 'UPI_INTENT', 'UPI_QR']);
    upiMode.paymentInstruments.forEach((instrument: any) => {
      expect(instrument.enabled).toBe(true);
    });
  });

  it('sends the cached O-Bearer token in Authorization header', async () => {
    const { adapter, tokenManager, fetchMock } = createAdapter();

    await adapter.createPayment({
      orderId: 'order-2',
      orderAmount: 5000,
      currency: 'INR',
      customer: {},
    });

    expect(tokenManager.getAccessToken).toHaveBeenCalledTimes(1);
    expect(tokenManager.getAccessToken).toHaveBeenCalledWith(false);

    const [, fetchOptions] = fetchMock.mock.calls[0]!;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('O-Bearer cached-token');
  });
});

describe('PhonePeAdapter status normalization', () => {
  const buildAdapter = () => {
    const tokenManager = {
      getAccessToken: vi.fn(),
      invalidateToken: vi.fn(),
    };

    return new PhonePeAdapter(baseConfig, {
      tokenManager: tokenManager as any,
    });
  };

  it('maps cancellation states to cancelled', () => {
    const adapter = buildAdapter();

    expect((adapter as any).mapPaymentStatus('cancelled')).toBe('cancelled');
    expect((adapter as any).mapPaymentStatus('CANCELED')).toBe('cancelled');
    expect((adapter as any).mapPaymentStatus('timedout')).toBe('cancelled');
    expect((adapter as any).mapPaymentStatus('EXPIRED')).toBe('cancelled');
  });

  it('maps success and failure states without mislabeling cancellations', () => {
    const adapter = buildAdapter();

    expect((adapter as any).mapPaymentStatus('completed')).toBe('captured');
    expect((adapter as any).mapPaymentStatus('pending')).toBe('processing');
    expect((adapter as any).mapPaymentStatus('failed')).toBe('failed');
    expect((adapter as any).mapPaymentStatus('  unknown_state  ')).toBe('processing');
  });
});

