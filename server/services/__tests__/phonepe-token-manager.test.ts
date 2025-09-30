import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhonePeConfig } from '../../../shared/payment-providers';
import { PhonePeTokenManager } from '../phonepe-token-manager';

const baseConfig: PhonePeConfig = {
  client_id: 'client-id',
  client_secret: 'client-secret',
  client_version: '1.0.0',
  merchantId: 'merchant-id',
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
};

describe('PhonePeTokenManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the cached token when it is still valid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: 'token-1', expiresIn: 600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const manager = new PhonePeTokenManager({
      config: baseConfig,
      environment: 'test',
      fetchFn: fetchMock,
    });

    const firstToken = await manager.getAccessToken();
    const secondToken = await manager.getAccessToken();

    expect(firstToken).toBe('token-1');
    expect(secondToken).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors activeHost overrides when selecting the authorization endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: 'token-override', expiresIn: 600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const customHost = 'https://sandbox-overrides.phonepe.example/base/';
    const manager = new PhonePeTokenManager({
      config: { ...baseConfig, activeHost: customHost },
      environment: 'live',
      fetchFn: fetchMock,
    });

    await manager.getAccessToken(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox-overrides.phonepe.example/base/v3/authorization/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('refreshes the token within the pre-expiry window', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'token-1', expiresIn: 600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'token-2', expiresIn: 600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const manager = new PhonePeTokenManager({
      config: baseConfig,
      environment: 'test',
      fetchFn: fetchMock,
    });

    await manager.getAccessToken();

    // Move time to within the 4 minute refresh window (600s total - 240s window + 1s)
    vi.setSystemTime(new Date('2024-01-01T00:06:01.000Z'));

    const tokenWhileRefreshing = await manager.getAccessToken();

    expect(tokenWhileRefreshing).toBe('token-1');

    // Allow the refresh promise to settle and verify the next call uses the new token.
    await (manager as any).refreshPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const refreshedToken = await manager.getAccessToken();

    expect(refreshedToken).toBe('token-2');
  });

  it('forces a renewal when the API indicates the token expired', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'token-1', expiresIn: 600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'token-2', expiresIn: 600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const manager = new PhonePeTokenManager({
      config: baseConfig,
      environment: 'test',
      fetchFn: fetchMock,
    });

    await manager.getAccessToken();
    manager.invalidateToken();

    const renewedToken = await manager.getAccessToken(true);

    expect(renewedToken).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
