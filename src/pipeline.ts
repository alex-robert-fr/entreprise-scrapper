import { Etablissement } from "./sirene.js";
import { isKnownByUser, insertWithCreditConsume, ScrapedRecord } from "./db/scraped.js";
import { InsufficientCreditsError } from "./db/credits.js";
import { findPhoneGoogle } from "./googleMaps.js";
import { fetchDirigeants } from "./annuaireEntreprises.js";

export interface PipelineResult {
  newCount: number;
  alreadyKnown: number;
  notFoundCount: number;
  prospects: ScrapedRecord[];
  stoppedForCredits?: boolean;
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
  let stoppedForCredits = false;
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

      try {
        const inserted = await insertWithCreditConsume(record, userId);
        if (!inserted) {
          alreadyKnown++;
          continue;
        }
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          stoppedForCredits = true;
          break;
        }
        throw err;
      }

      if (phone === null) {
        notFoundCount++;
      } else {
        newCount++;
        prospects.push(record);
      }
  }

  return { newCount, alreadyKnown, notFoundCount, prospects, stoppedForCredits };
}
