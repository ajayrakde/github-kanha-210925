import type { Logger } from "../types/logger";

export interface SessionSecretsManager {
  loadSecrets(): Promise<string[]>;
}

export interface SessionSecretRotatorOptions {
  rotationIntervalMs?: number;
  requireSecret: boolean;
  developmentFallbackSecret?: string;
  logger?: Logger;
}

export class EnvironmentSessionSecretsManager implements SessionSecretsManager {
  async loadSecrets(): Promise<string[]> {
    const secrets: string[] = [];

    const current = process.env.SESSION_SECRET?.trim();
    if (current) {
      secrets.push(current);
    }

    const previous = process.env.SESSION_SECRET_PREVIOUS?.trim();
    if (previous) {
      secrets.push(previous);
    }

    return secrets;
  }
}

export class SessionSecretRotator {
  private readonly secrets: string[] = [];
  private interval: NodeJS.Timeout | undefined;

  constructor(
    private readonly manager: SessionSecretsManager,
    private readonly options: SessionSecretRotatorOptions
  ) {}

  public async initialize(): Promise<string[]> {
    await this.refreshSecrets({ throwOnEmpty: this.options.requireSecret });

    const intervalMs = this.options.rotationIntervalMs ?? 1000 * 60 * 15;
    if (intervalMs > 0) {
      this.interval = setInterval(() => {
        this.refreshSecrets({ throwOnEmpty: false }).catch((error) => {
          this.options.logger?.error?.(
            "Failed to refresh session secrets from manager",
            error
          );
        });
      }, intervalMs);

      // Prevent the timer from keeping the event loop alive when shutting down
      if (typeof this.interval.unref === "function") {
        this.interval.unref();
      }
    }

    return this.secrets;
  }

  public async refreshSecrets({ throwOnEmpty }: { throwOnEmpty: boolean }): Promise<void> {
    const resolved = await this.manager.loadSecrets();
    const sanitized = resolved
      .map((secret) => secret.trim())
      .filter((secret) => secret.length > 0);

    if (sanitized.length === 0) {
      if (throwOnEmpty) {
        throw new Error(
          "SESSION_SECRET is required in production. Configure the secrets manager to return at least one active secret."
        );
      }

      const fallback = this.options.developmentFallbackSecret ?? "dev-insecure-session-secret";
      this.options.logger?.warn?.(
        "Session secrets manager returned no secrets. Falling back to a development-only secret."
      );
      this.updateSecrets([fallback]);
      return;
    }

    if (this.secrets.length === 0 || this.secrets[0] !== sanitized[0]) {
      this.options.logger?.info?.(
        "Session secrets rotated. Using new primary secret while keeping previous values for verification."
      );
    }

    this.updateSecrets(sanitized);
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private updateSecrets(nextSecrets: string[]): void {
    this.secrets.splice(0, this.secrets.length, ...nextSecrets);
  }
}
