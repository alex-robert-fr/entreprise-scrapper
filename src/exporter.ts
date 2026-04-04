import { ScrapedRecord } from "./dedup";

export async function exportProspects(
  _prospects: ScrapedRecord[]
): Promise<string> {
  return "";
}

export async function exportNotFound(
  _notFound: ScrapedRecord[]
): Promise<void> {
  // TODO: append au fichier exports/not_found.csv
}
