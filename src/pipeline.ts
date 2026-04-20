import { Etablissement } from "./sirene";
import { isKnownByUser, insert, ScrapedRecord } from "./db/scraped";
import { findPhoneGoogle } from "./googleMaps";
import { fetchDirigeants } from "./annuaireEntreprises";

export interface PipelineResult {
  newCount: number;
  alreadyKnown: number;
  notFoundCount: number;
  prospects: ScrapedRecord[];
}

export type ProgressCallback = (current: number, nom: string) => void;

export async function runPipeline(
  source: Iterable<Etablissement> | AsyncIterable<Etablissement>,
  userId: string,
  onProgress?: ProgressCallback,
  limit?: number
): Promise<PipelineResult> {
  let newCount = 0;
  let alreadyKnown = 0;
  let notFoundCount = 0;
  const prospects: ScrapedRecord[] = [];
  let i = 0;

  for await (const etab of source) {
      if (limit !== undefined && newCount + notFoundCount >= limit) break;

      if (await isKnownByUser(userId, etab.siret)) {
        alreadyKnown++;
        continue;
      }

      onProgress?.(++i, etab.nom);

      const phone = await findPhoneGoogle(etab.nom, etab.ville);
      const siren = etab.siret.substring(0, 9);
      const dirigeants = await fetchDirigeants(siren);
      await new Promise((r) => setTimeout(r, 200));
      const scrapeSource = phone !== null ? "google" : "non_trouvé";

      if (phone === null) {
        notFoundCount++;
      } else {
        newCount++;
      }

      const record: ScrapedRecord = {
        siret: etab.siret,
        userId,
        nom: etab.nom,
        adresse: etab.adresse,
        ville: etab.ville,
        codePostal: etab.codePostal,
        telephone: phone,
        effectifTranche: etab.effectifTranche,
        formeJuridique: etab.formeJuridique,
        dirigeants,
        source: scrapeSource,
        scrapedAt: new Date().toISOString(),
      };

      await insert(record);

      if (scrapeSource !== "non_trouvé") {
        prospects.push(record);
      }
  }

  return { newCount, alreadyKnown, notFoundCount, prospects };
}
