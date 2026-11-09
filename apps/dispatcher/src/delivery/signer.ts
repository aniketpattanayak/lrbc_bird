import { generateWebhookSignature } from '@wsaas/crypto';

/**
 * Signs a webhook payload body with the tenant's webhook secret.
 * Tenants verify this against the X-WA-Signature header to confirm the
 * delivery actually came from us.
 */
export function signPayload(secret: string, rawBody: string): string {
  return generateWebhookSignature(secret, rawBody);
}
