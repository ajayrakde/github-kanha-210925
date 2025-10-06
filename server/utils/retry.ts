/**
 * Retry utility with exponential backoff
 * Attempts an operation up to maxAttempts times with increasing delays
 */

interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: any) => void;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      if (onRetry) {
        onRetry(attempt, error);
      }

      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Specific retry configuration for Cashfree order creation
 * 3 attempts with delays: 100ms, 200ms, 400ms
 */
export async function retryCashfreeOperation<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  return retryWithBackoff(operation, {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 500,
    backoffMultiplier: 2,
    onRetry,
  });
}
