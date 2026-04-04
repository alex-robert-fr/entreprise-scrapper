import { Etablissement } from "./sirene";
import { ScrapedRecord } from "./dedup";

export interface PipelineResult {
  nouveaux: number;
  alreadyKnown: number;
  nonTrouves: number;
  prospects: ScrapedRecord[];
}

export type ProgressCallback = (
  current: number,
  total: number,
  nom: string
) => void;

export async function runPipeline(
  _etablissements: Etablissement[],
  _onProgress?: ProgressCallback
): Promise<PipelineResult> {
  return { nouveaux: 0, alreadyKnown: 0, nonTrouves: 0, prospects: [] };
}
