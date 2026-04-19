import { z } from "zod";

export const resultFiltersSchema = z
  .object({
    source: z.enum(["found", "non_trouvé"]).optional(),
    sourceExact: z.enum(["google", "non_trouvé"]).optional(),
    nom: z.string().trim().min(1).optional(),
    ville: z.string().trim().min(1).optional(),
    phoneType: z.enum(["mobile", "fixe"]).optional(),
    effectif: z.string().trim().min(1).optional(),
    departement: z
      .string()
      .trim()
      .regex(/^\d{2,3}$|^2[AB]$/, "Format departement invalide")
      .optional(),
    formeJuridique: z.string().trim().min(1).optional(),
  })
  .strict();

export const resultsQuerySchema = resultFiltersSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
});

export const exportQuerySchema = resultFiltersSchema;

export type ResultFiltersInput = z.infer<typeof resultFiltersSchema>;
export type ResultsQuery = z.infer<typeof resultsQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
