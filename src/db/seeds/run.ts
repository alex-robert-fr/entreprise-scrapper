import "dotenv/config";
import { closeDb, db } from "../client";
import { seedProfessions } from "./professions";

async function main(): Promise<void> {
  const { inserted, skipped } = await seedProfessions(db);
  console.log(`✅ Seed professions — ${inserted} insérés, ${skipped} déjà présents`);
}

main()
  .catch((err) => {
    console.error("❌ Seed professions échoué :", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
