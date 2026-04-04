import Database from "better-sqlite3";

export interface ScrapedRecord {
  siret: string;
  nom: string;
  telephone: string;
  ville: string;
  scraped_at: string;
  source: string;
}

export interface ScrapedStats {
  total: number;
  found: number;
  notFound: number;
}

let db: Database.Database | undefined;

function requireDb(): Database.Database {
  if (!db) throw new Error("DB not initialized — appeler initDb() d'abord");
  return db;
}

export function initDb(): void {
  // TODO: ouvrir data/scraper.db et créer la table scraped
}

export function isKnown(siret: string): boolean {
  void requireDb();
  void siret;
  return false;
}

export function insert(record: ScrapedRecord): void {
  void requireDb();
  void record;
}

export function getStats(): ScrapedStats {
  void requireDb();
  return { total: 0, found: 0, notFound: 0 };
}

export function getAll(): ScrapedRecord[] {
  void requireDb();
  return [];
}
