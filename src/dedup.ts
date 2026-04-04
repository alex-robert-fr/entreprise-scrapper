import Database from "better-sqlite3";
import path from "path";
import { phoneTypeCondition } from "./phoneUtils";

export interface ScrapedRecord {
  siret: string;
  nom: string;
  adresse: string;
  ville: string;
  codePostal: string;
  telephone: string | null;
  effectifTranche: string;
  formeJuridique: string;
  dirigeants: string | null;
  source: string;
  scraped_at: string;
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

function buildWhereClause(filters: ResultFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.sourceExact) {
    conditions.push("source = ?");
    params.push(filters.sourceExact);
  } else if (filters.sourceFilter === "found") {
    conditions.push("source != 'non_trouvé'");
  } else if (filters.sourceFilter === "non_trouvé") {
    conditions.push("source = 'non_trouvé'");
  }

  if (filters.phoneType) conditions.push(phoneTypeCondition(filters.phoneType));
  if (filters.nom?.trim())         { conditions.push("nom LIKE ?");             params.push("%" + filters.nom.trim() + "%"); }
  if (filters.ville?.trim())       { conditions.push("ville LIKE ?");           params.push("%" + filters.ville.trim() + "%"); }
  if (filters.effectif?.trim())    { conditions.push("effectif_tranche = ?");   params.push(filters.effectif.trim()); }
  if (filters.departement?.trim())    { conditions.push("code_postal LIKE ?");      params.push(filters.departement.trim() + "%"); }
  if (filters.formeJuridique?.trim()) { conditions.push("forme_juridique = ?");    params.push(filters.formeJuridique.trim()); }

  return { where: conditions.length ? "WHERE " + conditions.join(" AND ") : "", params };
}

const DB_PATH = path.join(__dirname, "..", "data", "scraper.db");

let db: Database.Database | undefined;

function requireDb(): Database.Database {
  if (!db) throw new Error("DB not initialized — appeler initDb() d'abord");
  return db;
}

export function initDb(): void {
  if (db) return;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scraped (
      siret             TEXT PRIMARY KEY,
      nom               TEXT,
      adresse           TEXT,
      ville             TEXT,
      code_postal       TEXT,
      telephone         TEXT,
      effectif_tranche  TEXT,
      forme_juridique   TEXT,
      source            TEXT,
      scraped_at        TEXT
    )
  `);
  try {
    db.exec("ALTER TABLE scraped ADD COLUMN forme_juridique TEXT");
  } catch {
    // Colonne déjà présente
  }
  try {
    db.exec("ALTER TABLE scraped ADD COLUMN dirigeants TEXT");
  } catch {
    // Colonne déjà présente
  }
}

export function isKnown(siret: string): boolean {
  const row = requireDb().prepare("SELECT 1 FROM scraped WHERE siret = ?").get(siret);
  return row !== undefined;
}

export function insert(record: ScrapedRecord): void {
  requireDb()
    .prepare(
      `INSERT OR IGNORE INTO scraped
        (siret, nom, adresse, ville, code_postal, telephone, effectif_tranche, forme_juridique, dirigeants, source, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.siret,
      record.nom,
      record.adresse,
      record.ville,
      record.codePostal,
      record.telephone,
      record.effectifTranche,
      record.formeJuridique,
      record.dirigeants,
      record.source,
      record.scraped_at,
    );
}

export function getStats(): ScrapedStats {
  const mobileCond = phoneTypeCondition("mobile");
  const row = requireDb()
    .prepare(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source != 'non_trouvé' THEN 1 END) as found,
        COUNT(CASE WHEN source = 'non_trouvé' THEN 1 END) as notFound,
        COUNT(CASE WHEN source != 'non_trouvé' AND ${mobileCond} THEN 1 END) as mobile
      FROM scraped`
    )
    .get() as { total: number; found: number; notFound: number; mobile: number };
  return { total: row.total, found: row.found, notFound: row.notFound, mobile: row.mobile };
}

const SELECT_FIELDS = `
  siret, nom, adresse, ville,
  code_postal as codePostal, telephone,
  effectif_tranche as effectifTranche,
  forme_juridique as formeJuridique,
  dirigeants,
  source, scraped_at
`;

export function getNotFound(): ScrapedRecord[] {
  return requireDb()
    .prepare(`SELECT ${SELECT_FIELDS} FROM scraped WHERE source = 'non_trouvé' ORDER BY scraped_at DESC`)
    .all() as ScrapedRecord[];
}

export function updateRecord(siret: string, telephone: string, source: string): void {
  requireDb()
    .prepare("UPDATE scraped SET telephone = ?, source = ?, scraped_at = ? WHERE siret = ?")
    .run(telephone, source, new Date().toISOString(), siret);
}

export function getAll(filters: ResultFilters = {}): ScrapedRecord[] {
  const { where, params } = buildWhereClause(filters);
  return requireDb()
    .prepare(`SELECT ${SELECT_FIELDS} FROM scraped ${where} ORDER BY scraped_at DESC`)
    .all(params) as ScrapedRecord[];
}

export function getPaginated(
  page: number,
  limit: number,
  filters: ResultFilters = {}
): PaginatedResult<ScrapedRecord> {
  if (limit < 1) throw new Error("limit doit être >= 1");
  const conn = requireDb();
  const { where, params } = buildWhereClause(filters);

  const { count } = conn
    .prepare(`SELECT COUNT(*) as count FROM scraped ${where}`)
    .get(params) as { count: number };
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;
  const data = conn
    .prepare(`SELECT ${SELECT_FIELDS} FROM scraped ${where} ORDER BY scraped_at DESC LIMIT ? OFFSET ?`)
    .all([...params, limit, offset]) as ScrapedRecord[];
  return { data, total: count, page: safePage, totalPages };
}

export function getFilterOptions(): FilterOptions {
  const conn = requireDb();

  const villes = (conn
    .prepare("SELECT DISTINCT ville FROM scraped WHERE ville IS NOT NULL AND ville != '' ORDER BY ville")
    .all() as { ville: string }[]).map(r => r.ville);

  const sources = (conn
    .prepare("SELECT DISTINCT source FROM scraped WHERE source IS NOT NULL AND source NOT IN ('pagesjaunes') ORDER BY source")
    .all() as { source: string }[]).map(r => r.source);

  const effectifs = (conn
    .prepare("SELECT DISTINCT effectif_tranche FROM scraped WHERE effectif_tranche IS NOT NULL ORDER BY effectif_tranche")
    .all() as { effectif_tranche: string }[])
    .map(r => ({ value: r.effectif_tranche, label: EFFECTIF_LABELS[r.effectif_tranche] ?? r.effectif_tranche }));

  const departements = (conn
    .prepare("SELECT DISTINCT SUBSTR(code_postal, 1, 2) as dep FROM scraped WHERE code_postal IS NOT NULL AND code_postal != '' ORDER BY dep")
    .all() as { dep: string }[]).map(r => r.dep);

  const formesJuridiques = (conn
    .prepare("SELECT DISTINCT forme_juridique FROM scraped WHERE forme_juridique IS NOT NULL AND forme_juridique != '' ORDER BY forme_juridique")
    .all() as { forme_juridique: string }[]).map(r => r.forme_juridique);

  return { villes, sources, effectifs, departements, formesJuridiques };
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

export function getPhoneDuplicates(): PhoneDuplicatesReport {
  const conn = requireDb();

  const phones = (conn
    .prepare(
      `SELECT telephone, COUNT(*) as cnt FROM scraped
       WHERE telephone IS NOT NULL AND telephone != ''
       GROUP BY telephone
       HAVING cnt > 1
       ORDER BY cnt DESC`
    )
    .all() as { telephone: string; cnt: number }[]);

  const groups: PhoneDuplicateGroup[] = phones.map(({ telephone, cnt }) => {
    const records = conn
      .prepare(
        `SELECT ${SELECT_FIELDS} FROM scraped WHERE telephone = ?
         ORDER BY CASE WHEN source != 'non_trouvé' THEN 0 ELSE 1 END ASC, scraped_at DESC`
      )
      .all(telephone) as ScrapedRecord[];
    return { telephone, count: cnt, records };
  });

  const totalToDelete = groups.reduce((sum, g) => sum + g.count - 1, 0);

  return { groups, totalDuplicateGroups: groups.length, totalToDelete };
}

export function cleanPhoneDuplicates(): number {
  const conn = requireDb();

  const phones = (conn
    .prepare(
      `SELECT telephone FROM scraped
       WHERE telephone IS NOT NULL AND telephone != ''
       GROUP BY telephone
       HAVING COUNT(*) > 1`
    )
    .all() as { telephone: string }[]);

  let deleted = 0;

  const deleteStmt = conn.prepare("DELETE FROM scraped WHERE siret = ?");

  const cleanAll = conn.transaction(() => {
    for (const { telephone } of phones) {
      const rows = conn
        .prepare(
          `SELECT siret FROM scraped WHERE telephone = ?
           ORDER BY CASE WHEN source != 'non_trouvé' THEN 0 ELSE 1 END ASC, scraped_at DESC`
        )
        .all(telephone) as { siret: string }[];
      // garder le premier (source confirmée > plus récent), supprimer le reste
      for (let i = 1; i < rows.length; i++) {
        deleteStmt.run(rows[i].siret);
        deleted++;
      }
    }
  });

  cleanAll();
  return deleted;
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

export function getNameDuplicates(): NameDuplicatesReport {
  const conn = requireDb();

  // Uniquement les noms où au moins une entrée a un téléphone ET au moins une n'en a pas
  const names = (conn
    .prepare(
      `SELECT nom,
              COUNT(*) as cnt,
              COUNT(CASE WHEN telephone IS NOT NULL AND telephone != '' THEN 1 END) as withPhone,
              COUNT(CASE WHEN telephone IS NULL OR telephone = '' THEN 1 END) as withoutPhone
       FROM scraped
       GROUP BY nom
       HAVING withPhone > 0 AND withoutPhone > 0
       ORDER BY cnt DESC`
    )
    .all() as { nom: string; cnt: number; withPhone: number; withoutPhone: number }[]);

  const groups: NameDuplicateGroup[] = names.map(({ nom, withoutPhone }) => {
    const records = conn
      .prepare(
        `SELECT ${SELECT_FIELDS} FROM scraped WHERE nom = ?
         ORDER BY CASE WHEN telephone IS NOT NULL AND telephone != '' THEN 0 ELSE 1 END ASC, scraped_at DESC`
      )
      .all(nom) as ScrapedRecord[];
    return { nom, count: records.length, records };
  });

  // Seules les entrées sans téléphone sont candidates à la suppression
  const totalToDelete = groups.reduce((sum, g) => sum + g.records.filter(r => !r.telephone).length, 0);

  return { groups, totalDuplicateGroups: groups.length, totalToDelete };
}

export function cleanNameDuplicates(): number {
  const conn = requireDb();

  // Supprimer uniquement les entrées sans téléphone quand une entrée avec le même nom ET un téléphone existe
  const result = conn
    .prepare(
      `DELETE FROM scraped
       WHERE (telephone IS NULL OR telephone = '')
         AND nom IN (
           SELECT nom FROM scraped
           WHERE telephone IS NOT NULL AND telephone != ''
         )`
    )
    .run();

  return result.changes;
}
