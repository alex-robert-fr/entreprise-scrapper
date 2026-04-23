import "dotenv/config";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL manquante — impossible d'appliquer les migrations");
  }

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
