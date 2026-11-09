import { createHash, createHmac, timingSafeEqual, randomBytes } from 'crypto';

// ─── Token Generation ─────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure random token.
 * Default: 32 bytes = 64 hex characters
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generates a URL-safe base64 token (shorter than hex)
 */
export function generateUrlSafeToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, bytes);
}

// ─── SHA-256 Hashing (for tokens stored in DB) ────────────────────────────────
// SHA-256 is appropriate for tokens (not passwords) because:
// 1. Tokens are long random values (high entropy)
// 2. We need fast lookup (Argon2 is too slow for token verification)
// 3. We don't need to worry about dictionary attacks on random tokens

/**
 * Hashes a token with SHA-256. Use for:
 * - Password reset tokens
 * - Email verification tokens
 * - Team invite tokens
 * - Refresh tokens
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hashes an API key with SHA-256 for storage.
 * API keys are long random strings, so SHA-256 is appropriate.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Always use this when comparing tokens/hashes.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to prevent length-based timing attacks
    // but return false afterward
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ─── HMAC-SHA256 (for webhook signatures) ────────────────────────────────────

/**
 * Generates HMAC-SHA256 signature for webhook payloads.
 * Format: sha256=<hex_signature>
 *
 * Tenants verify this header to ensure webhooks come from your platform.
 */
export function generateWebhookSignature(secret: string, rawBody: string | Buffer): string {
  const hmac = createHmac('sha256', secret);
  if (typeof rawBody === 'string') {
    hmac.update(rawBody, 'utf8');
  } else {
    hmac.update(rawBody);
  }
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verifies a webhook signature.
 * Returns true if the signature matches.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  const expected = generateWebhookSignature(secret, rawBody);
  return safeCompare(expected, signature);
}

// ─── API Key Generation ───────────────────────────────────────────────────────

/**
 * Generates a new API key in the format: wapi_live_<32 random chars>
 * Returns both the full key (shown once) and the hash (stored in DB)
 */
export function generateApiKey(environment: 'live' | 'test' = 'live'): {
  fullKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = generateToken(24); // 48 hex chars
  const fullKey = `wapi_${environment}_${randomPart}`;
  const keyHash = hashApiKey(fullKey);
  const keyPrefix = fullKey.substring(0, 16); // "wapi_live_a8f3k9" for display

  return { fullKey, keyHash, keyPrefix };
}

// ─── Webhook Secret Generation ────────────────────────────────────────────────

/**
 * Generates a webhook secret and returns the hash for storage
 * The actual secret is shown to the user once, stored only as hash
 */
export function generateWebhookSecret(): {
  secret: string;
  secretHash: string;
  secretPrefix: string;
} {
  const secret = `whs_${generateToken(32)}`;
  const secretHash = hashToken(secret);
  const secretPrefix = secret.slice(-4); // Last 4 chars for display

  return { secret, secretHash, secretPrefix };
}

// ─── 2FA Backup Codes ────────────────────────────────────────────────────────

/**
 * Generates 10 backup codes for 2FA recovery.
 * Returns both plaintext (shown once) and hashed versions (stored in DB).
 */
export function generateBackupCodes(count = 10): {
  plaintext: string[];
  hashed: string[];
} {
  const plaintext: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX (8 chars, easy to type)
    const code = randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    plaintext.push(formatted);
    hashed.push(hashToken(formatted.replace('-', '')));
  }

  return { plaintext, hashed };
}
