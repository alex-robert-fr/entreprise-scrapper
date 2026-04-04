import Database from "better-sqlite3";
import path from "path";

export interface ScrapedRecord {
  siret: string;
  nom: string;
  telephone: string | null;
  ville: string;
  scraped_at: string;
  source: string;
}

export interface ScrapedStats {
  total: number;
  found: number;
  notFound: number;
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
      siret       TEXT PRIMARY KEY,
      nom         TEXT,
      telephone   TEXT,
      ville       TEXT,
      scraped_at  TEXT,
      source      TEXT
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
      "INSERT OR IGNORE INTO scraped (siret, nom, telephone, ville, scraped_at, source) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(record.siret, record.nom, record.telephone, record.ville, record.scraped_at, record.source);
}

export function getStats(): ScrapedStats {
  const row = requireDb()
    .prepare(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source != 'non_trouvé' THEN 1 END) as found,
        COUNT(CASE WHEN source = 'non_trouvé' THEN 1 END) as notFound
      FROM scraped`
    )
    .get() as { total: number; found: number; notFound: number };
  return { total: row.total, found: row.found, notFound: row.notFound };
}

export function getAll(): ScrapedRecord[] {
  return requireDb()
    .prepare("SELECT * FROM scraped ORDER BY scraped_at DESC")
    .all() as ScrapedRecord[];
}

export function getPaginated(page: number, limit: number): PaginatedResult<ScrapedRecord> {
  const db = requireDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM scraped").get() as { count: number };
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;
  const data = db
    .prepare("SELECT * FROM scraped ORDER BY scraped_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as ScrapedRecord[];
  return { data, total: count, page: safePage, totalPages };
}
