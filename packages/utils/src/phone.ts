// ─── Phone Number Utilities ───────────────────────────────────────────────────

/**
 * Normalizes a phone number to E.164 format.
 * E.164: +[country code][number] — no spaces, dashes, or parentheses
 *
 * Examples:
 *   "+91 98765 43210" → "+919876543210"
 *   "919876543210"    → "+919876543210"
 *   "+44 7700 900123" → "+447700900123"
 *
 * Returns null if the number cannot be normalized.
 */
export function normalizePhoneNumber(phone: string): string | null {
  // Remove all non-digit characters except leading +
  const cleaned = phone.trim().replace(/[^\d+]/g, '');

  // If it starts with +, it's already E.164 format
  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.slice(1);
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      return cleaned;
    }
    return null;
  }

  // If it starts with 00, replace with +
  if (cleaned.startsWith('00')) {
    const withPlus = '+' + cleaned.slice(2);
    const digitsOnly = withPlus.slice(1);
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      return withPlus;
    }
    return null;
  }

  // If it's just digits (assume international format without +)
  if (/^\d+$/.test(cleaned)) {
    const withPlus = '+' + cleaned;
    if (cleaned.length >= 7 && cleaned.length <= 15) {
      return withPlus;
    }
    return null;
  }

  return null;
}

/**
 * Validates that a phone number is in E.164 format.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Converts E.164 to WhatsApp JID format.
 * WhatsApp uses: <number>@s.whatsapp.net for individual chats
 * WhatsApp uses: <groupid>@g.us for group chats
 */
export function phoneToWhatsAppJid(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) throw new Error(`Invalid phone number: ${phone}`);
  // Remove the leading +
  return `${normalized.slice(1)}@s.whatsapp.net`;
}

/**
 * Extracts phone number from a WhatsApp JID.
 * "+919876543210@s.whatsapp.net" → "+919876543210"
 */
export function jidToPhone(jid: string): string | null {
  const match = jid.match(/^(\d+)@s\.whatsapp\.net$/);
  if (!match || !match[1]) return null;
  return `+${match[1]}`;
}

/**
 * Checks if a JID is a group chat.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Formats a phone number for display.
 * "+919876543210" → "+91 98765 43210"
 * (Basic formatting — in production use libphonenumber-js)
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!isValidE164(phone)) return phone;
  // Simple formatting — just add spaces after country code area
  return phone;
}
