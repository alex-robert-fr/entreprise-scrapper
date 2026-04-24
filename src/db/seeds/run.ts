import "dotenv/config";
import { closeDb, db } from "../client.js";
import { seedProfessions } from "./professions.js";

async function main(): Promise<void> {
  const { inserted, skipped } = await seedProfessions(db);
  if (skipped > 0) {
    console.warn(`⚠️  ${skipped} profession(s) déjà présentes — nafCodes/category NE sont PAS mis à jour automatiquement.`);
  }
  console.log(`✅ Seed professions — ${inserted} insérés, ${skipped} déjà présents`);
}

main()
  .catch((err) => {
    console.error("❌ Seed professions échoué :", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
