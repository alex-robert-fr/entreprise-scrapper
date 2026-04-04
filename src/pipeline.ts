import { Etablissement } from "./sirene";
import { initDb, isKnown, insert, ScrapedRecord } from "./dedup";
import { findPhoneGoogle } from "./googleMaps";
import { findPhonePJ } from "./pagesJaunes";

export interface PipelineResult {
  newCount: number;
  alreadyKnown: number;
  notFoundCount: number;
  prospects: ScrapedRecord[];
}

export type ProgressCallback = (
  current: number,
  total: number,
  nom: string
) => void;

export async function runPipeline(
  etablissements: Etablissement[],
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  initDb();

  let newCount = 0;
  let alreadyKnown = 0;
  let notFoundCount = 0;
  const prospects: ScrapedRecord[] = [];

  let i = 0;
  for (const etab of etablissements) {
    onProgress?.(++i, etablissements.length, etab.nom);

    if (isKnown(etab.siret)) {
      alreadyKnown++;
      continue;
    }

    let phone = await findPhoneGoogle(etab.nom, etab.ville);
    let source: string;

    if (phone !== null) {
      source = "google";
    } else {
      phone = await findPhonePJ(etab.nom, etab.ville);
      source = phone !== null ? "pagesjaunes" : "non_trouvé";
    }

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
      source,
      scraped_at: new Date().toISOString(),
    };

    insert(record);

    if (source !== "non_trouvé") {
      prospects.push(record);
    }
  }

  return { newCount, alreadyKnown, notFoundCount, prospects };
}
