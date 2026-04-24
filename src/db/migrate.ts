import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL manquante — impossible d'appliquer les migrations");
  }

  // Connexion dédiée et éphémère — ne pas réutiliser le pool applicatif (db/client.ts)
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log("[migrate] application des migrations...");
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[migrate] done");
  } finally {
    await client.end({ timeout: 5 });
  }
}
