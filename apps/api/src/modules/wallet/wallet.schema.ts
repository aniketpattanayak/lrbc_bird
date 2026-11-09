import { z } from 'zod';

export const createTopupOrderSchema = z.object({
  amountRupees: z.number().int().positive(),
});
export type CreateTopupOrderDto = z.infer<typeof createTopupOrderSchema>;

export const verifyTopupSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyTopupDto = z.infer<typeof verifyTopupSchema>;

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
