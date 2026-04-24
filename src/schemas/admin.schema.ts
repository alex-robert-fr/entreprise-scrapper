import { z } from "zod";

export const adminCreditBodySchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine((n) => n !== 0, { message: "amount ne peut pas être 0" }),
    note: z.string().trim().min(1).max(500),
  })
  .strict();

export const adminUsersQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type AdminCreditBody = z.infer<typeof adminCreditBodySchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
