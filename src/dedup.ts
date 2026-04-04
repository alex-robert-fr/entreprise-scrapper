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
      source            TEXT,
      scraped_at        TEXT
    )
  `);
}

export function isKnown(siret: string): boolean {
  const row = requireDb().prepare("SELECT 1 FROM scraped WHERE siret = ?").get(siret);
  return row !== undefined;
}

export function insert(record: ScrapedRecord): void {
  requireDb()
    .prepare(
      `INSERT OR IGNORE INTO scraped
        (siret, nom, adresse, ville, code_postal, telephone, effectif_tranche, source, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      record.siret,
      record.nom,
      record.adresse,
      record.ville,
      record.codePostal,
      record.telephone,
      record.effectifTranche,
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
        COUNT(CASE WHEN ${mobileCond} THEN 1 END) as mobile
      FROM scraped`
    )
    .get() as { total: number; found: number; notFound: number; mobile: number };
  return { total: row.total, found: row.found, notFound: row.notFound, mobile: row.mobile };
}

const SELECT_FIELDS = `
  siret, nom, adresse, ville,
  code_postal as codePostal, telephone,
  effectif_tranche as effectifTranche, source, scraped_at
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

export function getAll(phoneType?: "mobile" | "fixe"): ScrapedRecord[] {
  const where = phoneType ? `WHERE ${phoneTypeCondition(phoneType)}` : "";
  return requireDb()
    .prepare(`SELECT ${SELECT_FIELDS} FROM scraped ${where} ORDER BY scraped_at DESC`)
    .all() as ScrapedRecord[];
}

export function getPaginated(
  page: number,
  limit: number,
  sourceFilter?: "found" | "non_trouvé",
  search?: string,
  phoneType?: "mobile" | "fixe"
): PaginatedResult<ScrapedRecord> {
  if (limit < 1) throw new Error("limit doit être >= 1");
  const conn = requireDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (sourceFilter === "found")      conditions.push("source != 'non_trouvé'");
  if (sourceFilter === "non_trouvé") conditions.push("source = 'non_trouvé'");

  if (phoneType) conditions.push(phoneTypeCondition(phoneType));

  if (search && search.trim()) {
    const like = "%" + search.trim() + "%";
    conditions.push("(nom LIKE ? OR ville LIKE ?)");
    params.push(like, like);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

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
