import Database from "better-sqlite3";

export interface ScrapedRecord {
  siret: string;
  nom: string;
  telephone: string;
  ville: string;
  scraped_at: string;
  source: string;
}

export interface Stats {
  total: number;
  found: number;
  notFound: number;
}

let db: Database.Database | undefined;

export function initDb(): void {
  // TODO: ouvrir data/scraper.db et créer la table scraped
}

export function isKnown(siret: string): boolean {
  void siret;
  return false;
}

export function insert(record: ScrapedRecord): void {
  void record;
}

export function getStats(): Stats {
  return { total: 0, found: 0, notFound: 0 };
}

export function getAll(): ScrapedRecord[] {
  return [];
}

void db;
