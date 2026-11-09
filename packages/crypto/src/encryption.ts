import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────────
// Used to encrypt WhatsApp session credentials at rest.
// Each record gets a unique IV — never reuse IVs with the same key.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits — recommended for GCM
const TAG_LENGTH = 16;  // 128-bit authentication tag

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a Buffer containing: [IV (12 bytes) | AuthTag (16 bytes) | Ciphertext]
 */
export function encrypt(plaintext: string | Buffer, masterKey: string): Buffer {
  const key = Buffer.from(masterKey, 'hex');

  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Concatenate: IV + AuthTag + Ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts data encrypted with the encrypt() function.
 * Input must be a Buffer containing: [IV (12 bytes) | AuthTag (16 bytes) | Ciphertext]
 */
export function decrypt(encryptedBuffer: Buffer, masterKey: string): string {
  const key = Buffer.from(masterKey, 'hex');

  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }

  if (encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt a JavaScript object (serializes to JSON first)
 */
export function encryptObject<T>(obj: T, masterKey: string): Buffer {
  return encrypt(JSON.stringify(obj), masterKey);
}

/**
 * Decrypt and parse a JavaScript object
 */
export function decryptObject<T>(encryptedBuffer: Buffer, masterKey: string): T {
  const json = decrypt(encryptedBuffer, masterKey);
  return JSON.parse(json) as T;
}
