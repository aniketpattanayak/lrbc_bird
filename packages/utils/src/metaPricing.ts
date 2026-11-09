/**
 * Meta WhatsApp Cloud API conversation-based pricing (approximate, INR).
 *
 * Meta bills per 24-hour "conversation" opened, bucketed by category
 * (Marketing / Utility / Authentication / Service) and by the recipient's
 * country. Real-time exact rates come from Meta's own rate card and change
 * periodically — https://developers.facebook.com/docs/whatsapp/pricing.
 *
 * This table is a configurable approximation used to pre-authorize and debit
 * the tenant's wallet at send time. It intentionally errs slightly high so
 * the platform is never caught undercharging while Meta's own invoice lands
 * days later. Update PRICE_TABLE_INR_PAISE as Meta's published rates change,
 * or wire this up to Meta's Conversation Pricing API for exact, live rates.
 */

export type MetaMessageCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE';

// All prices in paise (1 INR = 100 paise) per conversation, India rates as the
// default bucket. Extend `PRICE_TABLE_INR_PAISE` with more country codes as needed.
const PRICE_TABLE_INR_PAISE: Record<string, Record<MetaMessageCategory, number>> = {
  IN: { MARKETING: 88, UTILITY: 16, AUTHENTICATION: 16, SERVICE: 0 },
  DEFAULT: { MARKETING: 250, UTILITY: 60, AUTHENTICATION: 60, SERVICE: 0 },
};

export function getMessageCostPaise(countryCode: string | null | undefined, category: MetaMessageCategory = 'UTILITY'): number {
  const table = (countryCode && PRICE_TABLE_INR_PAISE[countryCode.toUpperCase()]) ?? PRICE_TABLE_INR_PAISE['DEFAULT'];
  return table[category];
}

/** Service conversations (customer-initiated, within the free 24h window) are free. */
export const FREE_CATEGORY: MetaMessageCategory = 'SERVICE';
