import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./client";
import { phoneCache } from "./schema";

const TTL_DAYS = 90;

export interface CachedPhone {
  telephone: string;
  source: string;
  scrapedAt: Date;
}

export async function getCachedPhone(siret: string): Promise<CachedPhone | null> {
  const freshnessBoundary = sql`now() - interval '${sql.raw(String(TTL_DAYS))} days'`;
  const [row] = await db
    .select({
      telephone: phoneCache.telephone,
      source: phoneCache.source,
      scrapedAt: phoneCache.scrapedAt,
    })
    .from(phoneCache)
    .where(and(eq(phoneCache.siret, siret), gte(phoneCache.scrapedAt, freshnessBoundary)))
    .limit(1);
  return row ?? null;
}

export async function setCachedPhone(
  siret: string,
  telephone: string,
  source: string,
): Promise<void> {
  await db
    .insert(phoneCache)
    .values({ siret, telephone, source, scrapedAt: new Date() })
    .onConflictDoUpdate({
      target: phoneCache.siret,
      set: { telephone, source, scrapedAt: new Date() },
    });
}

export async function purgeExpiredPhoneCache(): Promise<number> {
  const result = await db.execute<{ count: number }>(
    sql`with deleted as (
          delete from ${phoneCache}
          where ${phoneCache.scrapedAt} < now() - interval '${sql.raw(String(TTL_DAYS))} days'
          returning 1
        )
        select count(*)::int as count from deleted`,
  );
  return result[0]?.count ?? 0;
}
