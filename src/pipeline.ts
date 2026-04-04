import { Etablissement } from "./sirene";
import { ScrapedRecord } from "./dedup";

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
  _etablissements: Etablissement[],
  _onProgress?: ProgressCallback
): Promise<PipelineResult> {
  return { newCount: 0, alreadyKnown: 0, notFoundCount: 0, prospects: [] };
}
