/**
 * Retry schedule for webhook delivery: 3 attempts total, with delays of
 * 5 seconds, 30 seconds, and 5 minutes between them.
 */
export const RETRY_DELAYS_MS = [5_000, 30_000, 5 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 1 initial + 3 retries... see note below

/**
 * Given the attempt number that just failed (1-indexed), returns the delay
 * before the next attempt, or null if no more retries should happen.
 *
 * attempt 1 fails -> retry after 5s (attempt 2)
 * attempt 2 fails -> retry after 30s (attempt 3)
 * attempt 3 fails -> retry after 5min (attempt 4)
 * attempt 4 fails -> give up, mark FAILED / DEAD_LETTER
 */
export function nextRetryDelayMs(failedAttemptNumber: number): number | null {
  const idx = failedAttemptNumber - 1;
  if (idx < 0 || idx >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[idx] ?? null;
}

export function isFinalAttempt(attemptNumber: number): boolean {
  return attemptNumber >= RETRY_DELAYS_MS.length + 1;
}
