import { asc, eq } from "drizzle-orm";
import { db } from "./client.js";
import { professions, type ProfessionRow } from "./schema.js";

export function listActiveProfessions(): Promise<ProfessionRow[]> {
  return db
    .select()
    .from(professions)
    .where(eq(professions.active, true))
    .orderBy(asc(professions.category), asc(professions.libelle));
}

export async function getProfessionById(id: number): Promise<ProfessionRow | undefined> {
  const rows = await db.select().from(professions).where(eq(professions.id, id)).limit(1);
  return rows[0];
}
