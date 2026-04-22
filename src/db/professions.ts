import { asc, eq } from "drizzle-orm";
import { db } from "./client";
import { professions, type ProfessionRow } from "./schema";

export function listActiveProfessions(): Promise<ProfessionRow[]> {
  return db
    .select()
    .from(professions)
    .where(eq(professions.active, true))
    .orderBy(asc(professions.category), asc(professions.libelle));
}
