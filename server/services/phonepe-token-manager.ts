import type { Environment, PhonePeConfig } from '../../shared/payment-providers';
import { resolvePhonePeHost } from './phonepe-host';

interface PhonePeAuthorizationResponse {
  accessToken: string;
  expiresIn?: number;
  expiresAt?: number | string;
}

interface TokenState {
  token: string;
  expiresAt: number;
}

export interface PhonePeTokenManagerOptions {
  config: PhonePeConfig;
  environment: Environment;
  refreshWindowMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Manages OAuth access tokens for PhonePe API calls.
 */
export class PhonePeTokenManager {
  private readonly config: PhonePeConfig;
  private readonly environment: Environment;
  private readonly refreshWindowMs: number;
  private readonly fetchFn: typeof fetch;
  private tokenState?: TokenState;
  private refreshPromise?: Promise<string>;

  constructor(options: PhonePeTokenManagerOptions) {
    this.config = options.config;
    this.environment = options.environment;
    this.refreshWindowMs = options.refreshWindowMs ?? 4 * 60 * 1000; // 4 minutes
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Retrieve a valid access token, refreshing when required.
   */
  public async getAccessToken(forceRefresh: boolean = false): Promise<string> {
    const now = Date.now();

    if (!forceRefresh && this.tokenState && !this.isExpired(this.tokenState.expiresAt, now)) {
      if (this.shouldRefresh(this.tokenState.expiresAt, now) && !this.refreshPromise) {
        this.refreshPromise = this.requestFreshToken();
      }

      if (this.refreshPromise && this.shouldRefresh(this.tokenState.expiresAt, now)) {
        // Return the current token while a background refresh runs.
        return this.tokenState.token;
      }

      return this.tokenState.token;
    }

    if (forceRefresh) {
      this.tokenState = undefined;
    }

    if (!this.refreshPromise || forceRefresh) {
      this.refreshPromise = this.requestFreshToken();
    }

    return this.refreshPromise;
  }

  /**
   * Explicitly mark the cached token as expired.
   */
  public invalidateToken(): void {
    this.tokenState = undefined;
    this.refreshPromise = undefined;
  }

  private async requestFreshToken(): Promise<string> {
    const requestPromise = (async () => {
      const response = await this.fetchFn(this.buildAuthorizationUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CLIENT-ID': this.config.client_id,
          'X-CLIENT-VERSION': this.config.client_version,
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.config.client_id,
          client_secret: this.config.client_secret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PhonePe authorization failed: ${response.status} ${errorText}`);
      }

      const payload = (await response.json()) as PhonePeAuthorizationResponse;
      if (!payload.accessToken) {
        throw new Error('PhonePe authorization response missing accessToken');
      }

      const expiresAt = this.resolveExpiry(payload);
      this.tokenState = {
        token: payload.accessToken,
        expiresAt,
      };

      return payload.accessToken;
    })();

    const finalPromise = requestPromise.finally(() => {
      this.refreshPromise = undefined;
    });

    return finalPromise;
  }

  private resolveExpiry(payload: PhonePeAuthorizationResponse): number {
    const now = Date.now();

    if (payload.expiresAt !== undefined) {
      const expiresAt = typeof payload.expiresAt === 'string'
        ? Date.parse(payload.expiresAt)
        : payload.expiresAt;

      if (Number.isFinite(expiresAt)) {
        return expiresAt!;
      }
    }

    if (payload.expiresIn !== undefined) {
      return now + payload.expiresIn * 1000;
    }

    // Default to one hour if no expiry is provided to avoid unbounded caching.
    return now + 60 * 60 * 1000;
  }

  private shouldRefresh(expiresAt: number, now: number): boolean {
    return expiresAt - now <= this.refreshWindowMs;
  }

  private isExpired(expiresAt: number, now: number): boolean {
    return expiresAt <= now;
  }

  private buildAuthorizationUrl(): string {
    const baseUrl = resolvePhonePeHost(this.config, this.environment);

    return `${baseUrl.replace(/\/$/, '')}/v3/authorization/oauth/token`;
  }
}
