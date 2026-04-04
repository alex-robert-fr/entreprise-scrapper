import { Etablissement } from "./sirene";
import { initDb, isKnown, insert, ScrapedRecord } from "./dedup";
import { findPhoneGoogle } from "./googleMaps";

export interface PipelineResult {
  newCount: number;
  alreadyKnown: number;
  notFoundCount: number;
  prospects: ScrapedRecord[];
}

export type ProgressCallback = (current: number, nom: string) => void;

export async function runPipeline(
  source: Iterable<Etablissement> | AsyncIterable<Etablissement>,
  onProgress?: ProgressCallback,
  limit?: number
): Promise<PipelineResult> {
  initDb();

  let newCount = 0;
  let alreadyKnown = 0;
  let notFoundCount = 0;
  const prospects: ScrapedRecord[] = [];
  let i = 0;

  for await (const etab of source) {
      if (isKnown(etab.siret)) {
        alreadyKnown++;
        continue;
      }

      if (limit !== undefined && newCount + notFoundCount >= limit) break;

      onProgress?.(++i, etab.nom);

      const phone = await findPhoneGoogle(etab.nom, etab.ville);
      const scrapeSource = phone !== null ? "google" : "non_trouvé";

      if (phone === null) {
        notFoundCount++;
      } else {
        newCount++;
      }

      const record: ScrapedRecord = {
        siret: etab.siret,
        nom: etab.nom,
        adresse: etab.adresse,
        ville: etab.ville,
        codePostal: etab.codePostal,
        telephone: phone,
        effectifTranche: etab.effectifTranche,
        formeJuridique: etab.formeJuridique,
        source: scrapeSource,
        scraped_at: new Date().toISOString(),
      };

      insert(record);

      if (scrapeSource !== "non_trouvé") {
        prospects.push(record);
      }
  }

  return { newCount, alreadyKnown, notFoundCount, prospects };
}
