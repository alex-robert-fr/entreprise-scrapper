import { and, desc, eq, ilike, inArray, like, sql, type SQL } from "drizzle-orm";
import { db, pgClient } from "./client.js";
import { scrapedRecords, excluded } from "./schema.js";
import { phoneTypeCondition } from "../phoneUtils.js";
// Les filtres consommes par la couche DB — formes miroir du schema Zod
// cote HTTP, mais avec "sourceFilter" comme nom interne (le param HTTP
// s'appelle "source").
export interface ResultFilters {
  sourceFilter?:   "found" | "non_trouvé";
  sourceExact?:    "google" | "non_trouvé";
  nom?:            string;
  ville?:          string;
  phoneType?:      "mobile" | "fixe";
  effectif?:       string;
  departement?:    string;
  formeJuridique?: string;
}

export interface ScrapedRecord {
  siret:           string;
  userId:          string;
  nom:             string;
  adresse:         string;
  ville:           string;
  codePostal:      string;
  telephone:       string | null;
  effectifTranche: string;
  formeJuridique:  string;
  dirigeants:      string | null;
  source:          string;
  scrapedAt:       string;
}

export interface ScrapedStats {
  total: number;
  found: number;
  notFound: number;
  mobile: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}


export interface FilterOptions {
  villes:           string[];
  sources:          string[];
  effectifs:        Array<{ value: string; label: string }>;
  departements:     string[];
  formesJuridiques: string[];
}

const EFFECTIF_LABELS: Record<string, string> = {
  "11": "10-19 sal.",
  "12": "20-49 sal.",
  "21": "50-99 sal.",
  "22": "100-199 sal.",
  "31": "200-249 sal.",
  "32": "250-499 sal.",
};

// Echappe les wildcards LIKE/ILIKE (%, _, \) dans la saisie utilisateur pour
// eviter que "M_ie" matche tout nom de 4 lettres ou que "100%" soit imprevisible.
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

function buildWhereClause(userId: string, filters: ResultFilters): SQL {
  const conditions: SQL[] = [eq(scrapedRecords.userId, userId)];

  if (filters.sourceExact) {
    conditions.push(eq(scrapedRecords.source, filters.sourceExact));
  } else if (filters.sourceFilter === "found") {
    conditions.push(sql`${scrapedRecords.source} != 'non_trouvé'`);
  } else if (filters.sourceFilter === "non_trouvé") {
    conditions.push(eq(scrapedRecords.source, "non_trouvé"));
  }

  if (filters.phoneType) conditions.push(phoneTypeCondition(filters.phoneType));
  if (filters.nom?.trim())         conditions.push(ilike(scrapedRecords.nom, `%${escapeLike(filters.nom.trim())}%`));
  if (filters.ville?.trim())       conditions.push(ilike(scrapedRecords.ville, `%${escapeLike(filters.ville.trim())}%`));
  if (filters.effectif?.trim())    conditions.push(eq(scrapedRecords.effectifTranche, filters.effectif.trim()));
  if (filters.departement?.trim()) conditions.push(like(scrapedRecords.codePostal, filters.departement.trim() + "%"));
  if (filters.formeJuridique?.trim()) conditions.push(eq(scrapedRecords.formeJuridique, filters.formeJuridique.trim()));

  return and(...conditions)!;
}

function toRecord(row: {
  siret:           string;
  userId:          string;
  nom:             string | null;
  adresse:         string | null;
  ville:           string | null;
  codePostal:      string | null;
  telephone:       string | null;
  effectifTranche: string | null;
  formeJuridique:  string | null;
  dirigeants:      string | null;
  source:          string;
  scrapedAt:       Date;
}): ScrapedRecord {
  return {
    siret:           row.siret,
    userId:          row.userId,
    nom:             row.nom ?? "",
    adresse:         row.adresse ?? "",
    ville:           row.ville ?? "",
    codePostal:      row.codePostal ?? "",
    telephone:       row.telephone,
    effectifTranche: row.effectifTranche ?? "",
    formeJuridique:  row.formeJuridique ?? "",
    dirigeants:      row.dirigeants,
    source:          row.source,
    scrapedAt:       row.scrapedAt.toISOString(),
  };
}

// No-op conservé pour compatibilité — les migrations sont gérées par drizzle-kit.
export function initDb(): void {}

// Scope par user : deux users peuvent avoir la meme fiche SIRET independamment.
// `excluded` reste globale pour cette issue (refonte prevue #66).
export async function isKnownByUser(userId: string, siret: string): Promise<boolean> {
  const [scraped, excl] = await Promise.all([
    db
      .select({ one: sql`1` })
      .from(scrapedRecords)
      .where(and(eq(scrapedRecords.userId, userId), eq(scrapedRecords.siret, siret)))
      .limit(1),
    db.select({ one: sql`1` }).from(excluded).where(eq(excluded.siret, siret)).limit(1),
  ]);
  return scraped.length > 0 || excl.length > 0;
}

export async function insert(record: ScrapedRecord): Promise<void> {
  await db
    .insert(scrapedRecords)
    .values({
      siret: record.siret,
      userId: record.userId,
      nom: record.nom,
      adresse: record.adresse,
      ville: record.ville,
      codePostal: record.codePostal,
      telephone: record.telephone,
      effectifTranche: record.effectifTranche,
      formeJuridique: record.formeJuridique,
      dirigeants: record.dirigeants,
      source: record.source,
      scrapedAt: new Date(record.scrapedAt),
    })
    .onConflictDoNothing({ target: [scrapedRecords.userId, scrapedRecords.siret] });
}

export async function getStats(userId: string): Promise<ScrapedStats> {
  const mobileCond = phoneTypeCondition("mobile");
  const [row] = await db
    .select({
      total:    sql<number>`count(*)::int`,
      found:    sql<number>`count(*) filter (where ${scrapedRecords.source} != 'non_trouvé')::int`,
      notFound: sql<number>`count(*) filter (where ${scrapedRecords.source} = 'non_trouvé')::int`,
      mobile:   sql<number>`count(*) filter (where ${scrapedRecords.source} != 'non_trouvé' and ${mobileCond})::int`,
    })
    .from(scrapedRecords)
    .where(eq(scrapedRecords.userId, userId));
  return row;
}

export async function getNotFound(userId: string): Promise<ScrapedRecord[]> {
  const rows = await db
    .select()
    .from(scrapedRecords)
    .where(and(eq(scrapedRecords.userId, userId), eq(scrapedRecords.source, "non_trouvé")))
    .orderBy(desc(scrapedRecords.scrapedAt));
  return rows.map(toRecord);
}

export async function updateRecord(
  userId: string,
  siret: string,
  telephone: string,
  source: string,
): Promise<void> {
  await db
    .update(scrapedRecords)
    .set({ telephone, source, scrapedAt: new Date() })
    .where(and(eq(scrapedRecords.siret, siret), eq(scrapedRecords.userId, userId)));
}

function toRecordFromRaw(row: Record<string, unknown>): ScrapedRecord {
  const scrapedAt = row.scraped_at;
  const scrapedAtIso =
    scrapedAt instanceof Date ? scrapedAt.toISOString() : new Date(String(scrapedAt)).toISOString();
  return {
    siret:           row.siret as string,
    userId:          row.user_id as string,
    nom:             (row.nom             as string | null) ?? "",
    adresse:         (row.adresse         as string | null) ?? "",
    ville:           (row.ville           as string | null) ?? "",
    codePostal:      (row.code_postal     as string | null) ?? "",
    telephone:       (row.telephone       as string | null) ?? null,
    effectifTranche: (row.effectif_tranche as string | null) ?? "",
    formeJuridique:  (row.forme_juridique as string | null) ?? "",
    dirigeants:      (row.dirigeants      as string | null) ?? null,
    source:          row.source as string,
    scrapedAt:       scrapedAtIso,
  };
}

// Pont Drizzle -> postgres-js : Drizzle n'expose pas de cursor streame, donc on
// utilise pgClient.unsafe avec la SQL et les params produits par Drizzle. Le
// cast `params as never[]` contourne le typage interne de postgres-js et reste
// le SEUL point de fragilite : si Drizzle change son format de serialisation
// (dates, tableaux, UUIDs), ca compile mais crash a l'execution. A auditer a
// chaque bump majeur de drizzle-orm.
async function* streamDrizzleQuery<T extends Record<string, unknown>>(
  query: { toSQL(): { sql: string; params: unknown[] } },
  chunkSize: number,
): AsyncIterable<T> {
  const { sql: sqlText, params } = query.toSQL();
  const cursor = pgClient.unsafe<T[]>(sqlText, params as never[]).cursor(chunkSize);
  for await (const chunk of cursor) {
    for (const row of chunk) yield row;
  }
}

export async function* streamAll(
  userId: string,
  filters: ResultFilters = {},
  chunkSize = 500,
): AsyncIterable<ScrapedRecord> {
  const where = buildWhereClause(userId, filters);
  const query = db.select().from(scrapedRecords).where(where).orderBy(desc(scrapedRecords.scrapedAt));
  for await (const row of streamDrizzleQuery<Record<string, unknown>>(query, chunkSize)) {
    yield toRecordFromRaw(row);
  }
}

export async function getPaginated(
  userId: string,
  page: number,
  limit: number,
  filters: ResultFilters = {},
): Promise<PaginatedResult<ScrapedRecord>> {
  if (limit < 1) throw new Error("limit doit être >= 1");
  const where = buildWhereClause(userId, filters);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrapedRecords)
    .where(where);

  const totalPages = Math.max(1, Math.ceil(count / limit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;

  const rows = await db
    .select()
    .from(scrapedRecords)
    .where(where)
    .orderBy(desc(scrapedRecords.scrapedAt))
    .limit(limit)
    .offset(offset);

  return { data: rows.map(toRecord), total: count, page: safePage, totalPages };
}

export async function getFilterOptions(userId: string): Promise<FilterOptions> {
  const userScope = eq(scrapedRecords.userId, userId);
  const [villesRows, sourcesRows, effectifsRows, departementsRows, formesRows] = await Promise.all([
    db.selectDistinct({ value: scrapedRecords.ville })
      .from(scrapedRecords)
      .where(and(userScope, sql`${scrapedRecords.ville} is not null and ${scrapedRecords.ville} != ''`))
      .orderBy(scrapedRecords.ville),
    db.selectDistinct({ value: scrapedRecords.source })
      .from(scrapedRecords)
      .where(and(userScope, sql`${scrapedRecords.source} not in ('pagesjaunes')`))
      .orderBy(scrapedRecords.source),
    db.selectDistinct({ value: scrapedRecords.effectifTranche })
      .from(scrapedRecords)
      .where(and(userScope, sql`${scrapedRecords.effectifTranche} is not null`))
      .orderBy(scrapedRecords.effectifTranche),
    db.execute<{ dep: string }>(
      sql`select distinct substring(${scrapedRecords.codePostal} from 1 for 2) as dep from ${scrapedRecords}
          where ${scrapedRecords.userId} = ${userId}
            and ${scrapedRecords.codePostal} is not null and ${scrapedRecords.codePostal} != ''
          order by dep`,
    ),
    db.selectDistinct({ value: scrapedRecords.formeJuridique })
      .from(scrapedRecords)
      .where(and(userScope, sql`${scrapedRecords.formeJuridique} is not null and ${scrapedRecords.formeJuridique} != ''`))
      .orderBy(scrapedRecords.formeJuridique),
  ]);

  const keepString = (r: { value: string | null }): r is { value: string } => r.value !== null;

  return {
    villes:       villesRows.filter(keepString).map((r) => r.value),
    sources:      sourcesRows.filter(keepString).map((r) => r.value),
    effectifs:    effectifsRows.filter(keepString).map((r) => ({
                    value: r.value,
                    label: EFFECTIF_LABELS[r.value] ?? r.value,
                  })),
    departements: departementsRows.map((r) => r.dep),
    formesJuridiques: formesRows.filter(keepString).map((r) => r.value),
  };
}

export interface PhoneDuplicateGroup {
  telephone: string;
  count: number;
  records: ScrapedRecord[];
}

export interface PhoneDuplicatesReport {
  groups: PhoneDuplicateGroup[];
  totalDuplicateGroups: number;
  totalToDelete: number;
}

export async function getPhoneDuplicates(userId: string): Promise<PhoneDuplicatesReport> {
  const phones = await db.execute<{ telephone: string; cnt: number }>(
    sql`select telephone, count(*)::int as cnt from ${scrapedRecords}
        where ${scrapedRecords.userId} = ${userId}
          and telephone is not null and telephone != ''
        group by telephone
        having count(*) > 1
        order by cnt desc`,
  );
  if (phones.length === 0) {
    return { groups: [], totalDuplicateGroups: 0, totalToDelete: 0 };
  }

  const telephones = phones.map((p) => p.telephone);
  const rows = await db
    .select()
    .from(scrapedRecords)
    .where(and(eq(scrapedRecords.userId, userId), inArray(scrapedRecords.telephone, telephones)))
    .orderBy(
      sql`case when ${scrapedRecords.source} != 'non_trouvé' then 0 else 1 end`,
      desc(scrapedRecords.scrapedAt),
    );

  const byPhone = new Map<string, ScrapedRecord[]>();
  for (const row of rows) {
    const record = toRecord(row);
    if (!record.telephone) continue;
    const bucket = byPhone.get(record.telephone) ?? [];
    bucket.push(record);
    byPhone.set(record.telephone, bucket);
  }

  const groups: PhoneDuplicateGroup[] = phones.map(({ telephone, cnt }) => ({
    telephone,
    count: cnt,
    records: byPhone.get(telephone) ?? [],
  }));

  const totalToDelete = groups.reduce((sum, g) => sum + g.count - 1, 0);
  return { groups, totalDuplicateGroups: groups.length, totalToDelete };
}

export async function cleanPhoneDuplicates(userId: string): Promise<number> {
  const toExclude = await db.execute<{ siret: string }>(
    sql`with ranked as (
          select siret,
                 row_number() over (
                   partition by telephone
                   order by case when source != 'non_trouvé' then 0 else 1 end,
                            scraped_at desc
                 ) as rn
          from ${scrapedRecords}
          where user_id = ${userId}
            and telephone is not null and telephone != ''
            and telephone in (
              select telephone from ${scrapedRecords}
              where user_id = ${userId}
                and telephone is not null and telephone != ''
              group by telephone having count(*) > 1
            )
        )
        select siret from ranked where rn > 1`,
  );
  if (toExclude.length === 0) return 0;

  const sirets = toExclude.map((r) => r.siret);
  await db.transaction(async (tx) => {
    await tx
      .insert(excluded)
      .values(sirets.map((siret) => ({ siret })))
      .onConflictDoNothing({ target: excluded.siret });
    await tx
      .delete(scrapedRecords)
      .where(and(eq(scrapedRecords.userId, userId), inArray(scrapedRecords.siret, sirets)));
  });
  return sirets.length;
}

export interface NameDuplicateGroup {
  nom: string;
  count: number;
  records: ScrapedRecord[];
}

export interface NameDuplicatesReport {
  groups: NameDuplicateGroup[];
  totalDuplicateGroups: number;
  totalToDelete: number;
}

export async function getNameDuplicates(userId: string): Promise<NameDuplicatesReport> {
  const names = await db.execute<{ nom: string }>(
    sql`select nom from ${scrapedRecords}
        where ${scrapedRecords.userId} = ${userId}
        group by nom
        having
          count(*) filter (where telephone is not null and telephone != '') > 0
          and count(*) filter (where telephone is null or telephone = '') > 0
        order by count(*) desc`,
  );
  if (names.length === 0) {
    return { groups: [], totalDuplicateGroups: 0, totalToDelete: 0 };
  }

  const noms = names.map((n) => n.nom);
  const rows = await db
    .select()
    .from(scrapedRecords)
    .where(and(eq(scrapedRecords.userId, userId), inArray(scrapedRecords.nom, noms)))
    .orderBy(
      sql`case when ${scrapedRecords.telephone} is not null and ${scrapedRecords.telephone} != '' then 0 else 1 end`,
      desc(scrapedRecords.scrapedAt),
    );

  const byName = new Map<string, ScrapedRecord[]>();
  for (const row of rows) {
    const record = toRecord(row);
    const bucket = byName.get(record.nom) ?? [];
    bucket.push(record);
    byName.set(record.nom, bucket);
  }

  const groups: NameDuplicateGroup[] = names.map(({ nom }) => {
    const records = byName.get(nom) ?? [];
    return { nom, count: records.length, records };
  });

  const totalToDelete = groups.reduce(
    (sum, g) => sum + g.records.filter((r) => !r.telephone).length,
    0,
  );
  return { groups, totalDuplicateGroups: groups.length, totalToDelete };
}

export async function cleanNameDuplicates(userId: string): Promise<number> {
  const toExclude = await db.execute<{ siret: string }>(
    sql`select siret from ${scrapedRecords} s1
        where s1.user_id = ${userId}
          and (s1.telephone is null or s1.telephone = '')
          and s1.nom in (
            select nom from ${scrapedRecords} s2
            where s2.user_id = ${userId}
              and s2.telephone is not null and s2.telephone != ''
          )`,
  );
  if (toExclude.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const { siret } of toExclude) {
      await tx.insert(excluded).values({ siret }).onConflictDoNothing({ target: excluded.siret });
      await tx
        .delete(scrapedRecords)
        .where(and(eq(scrapedRecords.siret, siret), eq(scrapedRecords.userId, userId)));
    }
  });
  return toExclude.length;
}

// Retourne quasi-toujours 0 aujourd'hui : les SIRET dans excluded ont ete supprimes de
// scraped_records, donc le EXISTS ne matche pas. A refondre avec #66 (user_leads).
export async function getExcludedCount(userId: string): Promise<number> {
  const [{ count }] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from ${excluded} e
        where exists (
          select 1 from ${scrapedRecords} s
          where s.siret = e.siret
            and s.user_id = ${userId}
        )`,
  );
  return count;
}
