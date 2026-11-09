import { z } from 'zod';

export const checkoutSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});
export type CheckoutDto = z.infer<typeof checkoutSchema>;
