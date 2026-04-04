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

  for (let i = 0; i < etablissements.length; i++) {
    const e = etablissements[i];
    onProgress?.(i + 1, etablissements.length, e.nom);

    if (isKnown(e.siret)) {
      alreadyKnown++;
      continue;
    }

    let phone = await findPhoneGoogle(e.nom, e.ville);
    let source = "google";

    if (phone === null) {
      phone = await findPhonePJ(e.nom, e.ville);
      source = "pagesjaunes";
    }

    if (phone === null) {
      source = "non_trouvé";
      notFoundCount++;
    } else {
      newCount++;
    }

    const record: ScrapedRecord = {
      siret: e.siret,
      nom: e.nom,
      telephone: phone,
      ville: e.ville,
      scraped_at: new Date().toISOString(),
      source,
    };

    insert(record);
    prospects.push(record);
  }

  return { newCount, alreadyKnown, notFoundCount, prospects };
}
