import { z } from "zod";

// Schema preparatoire pour les webhooks Polar — la route consommatrice
// n'est pas encore branchee dans le serveur. Affiner les champs
// "data" quand l'integration sera implementee.
export const polarWebhookSchema = z
  .object({
    type: z.string().min(1),
    data: z
      .object({
        id: z.string().optional(),
        customer_id: z.string().optional(),
        product_id: z.string().optional(),
      })
      .passthrough(),
  })
  .strict();

export type PolarWebhook = z.infer<typeof polarWebhookSchema>;
