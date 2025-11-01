import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../services/config-resolver';
import { PhonePeAdapter } from '../phonepe-adapter';
import { normalizePaymentLifecycleStatus } from '../../../shared/payment-types';

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
    activeHost: undefined,
  },
};

const buildFetchResponse = (
  overrides: Partial<{
    instrumentResponse: Record<string, unknown>;
    transactionId: string;
    merchantTransactionId: string;
  }> = {}
) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    success: true,
    code: 'SUCCESS',
    message: 'Payment created',
    data: {
      merchantTransactionId: overrides.merchantTransactionId ?? 'merchant-txn',
      transactionId: overrides.transactionId ?? 'txn',
      instrumentResponse: {
        type: 'UPI_COLLECT',
        ...(overrides.instrumentResponse ?? {}),
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

  const createAdapter = (options?: {
    activeHost?: string;
    fetchMock?: ReturnType<typeof vi.fn>;
    tokenManager?: { getAccessToken: ReturnType<typeof vi.fn>; invalidateToken: ReturnType<typeof vi.fn> };
  }) => {
    const tokenManager =
      options?.tokenManager ?? {
        getAccessToken: vi.fn().mockResolvedValue('cached-token'),
        invalidateToken: vi.fn(),
      };

    const fetchMock = options?.fetchMock ?? vi.fn().mockResolvedValue(buildFetchResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    const adapterConfig: ResolvedConfig = {
      ...baseConfig,
      phonepeConfig: {
        ...baseConfig.phonepeConfig!,
        ...(options?.activeHost !== undefined
          ? { activeHost: options.activeHost }
          : {}),
      },
    };

    const adapter = new PhonePeAdapter(adapterConfig, {
      tokenManager: tokenManager as any,
    });

    return { adapter, tokenManager, fetchMock };
  };

  const decodeLastRequest = (fetchMock: ReturnType<typeof vi.fn>) => {
    const [, fetchOptions] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
    const requestBody = JSON.parse(fetchOptions.body as string) as { request: string };
    const payload = JSON.parse(
      Buffer.from(requestBody.request, 'base64').toString('utf8')
    );

    return { payload, headers: fetchOptions.headers as Record<string, string> };
  };

  it('serializes checkout payload with default UPI collect instrument', async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.createPayment({
      orderId: 'order-1',
      orderAmount: 12345,
      currency: 'INR',
      customer: {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { payload } = decodeLastRequest(fetchMock);

    expect(payload.amount).toBe(12345);
    expect(payload.paymentFlow).toEqual({ type: 'PG_CHECKOUT' });
    expect(payload.expireAfter).toBeGreaterThanOrEqual(300);
    expect(payload.expireAfter).toBeLessThanOrEqual(3600);

    expect(payload.redirectUrl).toBe(baseConfig.phonepeConfig?.redirectUrl);
    expect(payload.callbackUrl).toBe(baseConfig.phonepeConfig?.redirectUrl);
    expect(payload.paymentInstrument.type).toBe('UPI_COLLECT');

    expect(payload.paymentModeConfig.paymentModes).toHaveLength(1);
    const [upiMode] = payload.paymentModeConfig.paymentModes;
    expect(upiMode.paymentMode).toBe('UPI');

    const enabledMap = Object.fromEntries(
      upiMode.paymentInstruments.map((instrument: any) => [instrument.type, instrument.enabled])
    );

    expect(enabledMap).toEqual({
      UPI_INTENT: true,
      UPI_COLLECT: true,
      UPI_QR: true,
    });
  });

  it.each([
    { label: 'intent', instrumentPreference: 'intent', expectedType: 'UPI_INTENT' },
    { label: 'collect', instrumentPreference: 'collect', expectedType: 'UPI_COLLECT' },
    { label: 'qr', instrumentPreference: 'qr', expectedType: 'UPI_QR' },
  ])(
    'uses the cached token and advertises the %s instrument',
    async ({ instrumentPreference, expectedType }) => {
      const { adapter, tokenManager, fetchMock } = createAdapter();

      await adapter.createPayment({
        orderId: `order-${instrumentPreference}`,
        orderAmount: 5000,
        currency: 'INR',
        customer: {},
        providerOptions: {
          phonepe: {
            instrumentPreference,
          },
        },
      });

      expect(tokenManager.getAccessToken).toHaveBeenCalledTimes(1);
      expect(tokenManager.getAccessToken).toHaveBeenCalledWith(false);

      const { payload, headers } = decodeLastRequest(fetchMock);
      expect(headers['Authorization']).toBe('O-Bearer cached-token');

      expect(payload.paymentInstrument.type).toBe(expectedType);

      const [upiMode] = payload.paymentModeConfig.paymentModes;
      upiMode.paymentInstruments.forEach((instrument: any) => {
        expect(instrument.enabled).toBe(true);
      });
    }
  );

  it('honors explicit pay page requests', async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.createPayment({
      orderId: 'order-pay-page',
      orderAmount: 6000,
      currency: 'INR',
      customer: {},
      successUrl: 'https://merchant.example/custom-success',
      metadata: { phonepeCallbackUrl: 'https://merchant.example/callback' },
      providerOptions: {
        phonepe: {
          instrumentPreference: 'PAY_PAGE',
          payPage: 'IFRAME',
          payPageType: 'IFRAME',
        },
      },
    });

    const { payload } = decodeLastRequest(fetchMock);
    expect(payload.paymentInstrument.type).toBe('PAY_PAGE');
    expect(payload.redirectUrl).toBe('https://merchant.example/custom-success');
    expect(payload.callbackUrl).toBe('https://merchant.example/callback');

    const [upiMode] = payload.paymentModeConfig.paymentModes;
    const enabledMap = Object.fromEntries(
      upiMode.paymentInstruments.map((instrument: any) => [instrument.type, instrument.enabled])
    );

    expect(enabledMap).toEqual({
      UPI_INTENT: false,
      UPI_COLLECT: true,
      UPI_QR: false,
    });
  });

  it('prefers non-pay-page UPI instruments when both flags are present', async () => {
    const { adapter, fetchMock } = createAdapter();

    await adapter.createPayment({
      orderId: 'order-upi-qr',
      orderAmount: 4500,
      currency: 'INR',
      customer: {},
      providerOptions: {
        phonepe: {
          instrumentPreference: 'UPI_QR',
          payPageType: 'IFRAME',
        },
      },
    });

    const { payload } = decodeLastRequest(fetchMock);
    expect(payload.paymentInstrument.type).toBe('UPI_QR');

    const [upiMode] = payload.paymentModeConfig.paymentModes;
    const enabledMap = Object.fromEntries(
      upiMode.paymentInstruments.map((instrument: any) => [instrument.type, instrument.enabled])
    );

    expect(enabledMap).toEqual({
      UPI_INTENT: true,
      UPI_COLLECT: true,
      UPI_QR: true,
    });
  });

  it('uses the activeHost override to construct API URLs', async () => {
    const customHost = 'https://sandbox-gateway.phonepe.example';
    const { adapter, fetchMock } = createAdapter({ activeHost: customHost });

    await adapter.createPayment({
      orderId: 'order-host',
      orderAmount: 1000,
      currency: 'INR',
      customer: {},
    });

    expect(fetchMock).toHaveBeenCalled();
    const [requestUrl] = fetchMock.mock.calls[0]!;
    expect(requestUrl).toBe(`${customHost}/pg/v1/pay`);
  });

  it('refreshes the token and retries once when PhonePe returns 401', async () => {
    const tokenManager = {
      getAccessToken: vi.fn().mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token'),
      invalidateToken: vi.fn(),
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 'TOKEN_EXPIRED' }),
      } as any)
      .mockResolvedValueOnce(buildFetchResponse());

    const { adapter } = createAdapter({ fetchMock, tokenManager });

    await adapter.createPayment({
      orderId: 'order-refresh',
      orderAmount: 7000,
      currency: 'INR',
      customer: {},
    });

    expect(tokenManager.invalidateToken).toHaveBeenCalledTimes(1);
    expect(tokenManager.getAccessToken).toHaveBeenNthCalledWith(1, false);
    expect(tokenManager.getAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryOptions] = fetchMock.mock.calls[1]!;
    expect((retryOptions.headers as Record<string, string>)['Authorization']).toBe(
      'O-Bearer fresh-token'
    );
  });

  it('captures UPI metadata inside providerData', async () => {
    const expiresAt = '2024-01-01T00:10:00Z';
    const fetchMock = vi.fn().mockResolvedValue(
      buildFetchResponse({
        instrumentResponse: {
          type: 'UPI_INTENT',
          intentUrl: 'upi://pay?pa=merchant@upi&pn=Merchant&tn=Scan%20%26%20Pay&am=50',
          qrData: 'qr-payload',
          merchantVpa: 'merchant@upi',
          merchantName: 'Merchant',
          transactionNote: 'Scan & Pay',
          amount: '50.00',
          expiresAt,
        },
      })
    );

    const { adapter } = createAdapter({ fetchMock });

    const result = await adapter.createPayment({
      orderId: 'order-upi-meta',
      orderAmount: 5000,
      currency: 'INR',
      customer: {},
      providerOptions: {
        phonepe: { instrumentPreference: 'UPI_INTENT' },
      },
    });

    expect(result.providerData?.upiUrl).toBe(
      'upi://pay?pa=merchant@upi&pn=Merchant&tn=Scan%20%26%20Pay&am=50'
    );
    expect(result.providerData?.upiUrlRaw).toBe(
      'upi://pay?pa=merchant@upi&pn=Merchant&tn=Scan%20%26%20Pay&am=50'
    );
    expect(result.providerData?.qrData).toBe('qr-payload');
    expect(result.providerData?.merchantVpa).toBe('merchant@upi');
    expect(result.providerData?.merchantVpaNormalized).toBe('merchant@upi');
    expect(result.providerData?.merchantName).toBe('Merchant');
    expect(result.providerData?.merchantNameNormalized).toBe('Merchant');
    expect(result.providerData?.upiNote).toBe('Scan & Pay');
    expect(result.providerData?.upiNoteNormalized).toBe('Scan & Pay');
    expect(result.providerData?.upiAmount).toBe('50.00');
    expect(result.providerData?.upiAmountNormalized).toBe('50.00');
    expect(result.providerData?.qrExpiresAt).toBe('2024-01-01T00:10:00.000Z');
    expect(result.providerData?.qrExpiresAtNormalized).toBe('2024-01-01T00:10:00.000Z');
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

    expect(
      normalizePaymentLifecycleStatus((adapter as any).mapPaymentStatus('completed'))
    ).toBe('COMPLETED');
    expect((adapter as any).mapPaymentStatus('pending')).toBe('processing');
    expect((adapter as any).mapPaymentStatus('failed')).toBe('failed');
    expect((adapter as any).mapPaymentStatus('  unknown_state  ')).toBe('processing');
  });
});

