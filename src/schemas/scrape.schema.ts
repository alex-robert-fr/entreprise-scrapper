import { z } from "zod";
import { REGIONS_DEPARTEMENTS, normalizeRegion } from "../sirene.js";

const VALID_REGION_KEYS = new Set(Object.keys(REGIONS_DEPARTEMENTS));
const VALID_DEPARTEMENTS = new Set(Object.values(REGIONS_DEPARTEMENTS).flat());

const regionSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => VALID_REGION_KEYS.has(normalizeRegion(value)), {
    message: `Region inconnue. Valeurs autorisees : ${Object.keys(REGIONS_DEPARTEMENTS).join(", ")}`,
  });

const departementSchema = z
  .string()
  .trim()
  .regex(/^\d{2,3}$|^2[AB]$/, "Format departement invalide (ex: 75, 971, 2A)")
  .refine((value) => VALID_DEPARTEMENTS.has(value.padStart(2, "0")) || VALID_DEPARTEMENTS.has(value), {
    message: "Departement inconnu",
  });

export const scrapeBodySchema = z
  .object({
    region: regionSchema.optional(),
    departement: departementSchema.optional(),
    all: z.boolean().optional(),
    limit: z.number().int().min(1).max(10000).optional(),
    professionId: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (body) =>
      [body.region !== undefined, body.departement !== undefined, body.all === true]
        .filter(Boolean).length <= 1,
    { message: "region, departement et all sont mutuellement exclusifs" },
  );

export type ScrapeBody = z.infer<typeof scrapeBodySchema>;
