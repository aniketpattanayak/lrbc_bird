export interface DeliveryResult {
  success: boolean;
  httpStatusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  latencyMs: number;
}

/**
 * POSTs a signed webhook payload to a tenant's endpoint.
 * Never throws — failures (timeouts, non-2xx, network errors) are captured
 * in the returned DeliveryResult so the processor can record every attempt.
 *
 * Uses the global `fetch` (Node 18+) rather than a third-party HTTP client
 * to avoid ESM/CJS interop issues in this package's build.
 */
export async function postWebhook(
  url: string,
  rawBody: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<DeliveryResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: rawBody,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: controller.signal,
    });

    const body = await response.text().catch(() => '');

    return {
      success: response.status >= 200 && response.status < 300,
      httpStatusCode: response.status,
      responseBody: truncate(body),
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      success: false,
      httpStatusCode: null,
      responseBody: null,
      errorMessage: isAbort ? `Request timed out after ${timeoutMs}ms` : errorMessageOf(err),
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown delivery error';
}

function truncate(body: string, max = 2000): string {
  return body.length > max ? `${body.slice(0, max)}…[truncated]` : body;
}
