export interface Etablissement {
  siret: string;
  nom: string;
  adresse: string;
  ville: string;
  codePostal: string;
  effectifTranche: string;
  codeNaf: string;
}

export interface FetchOptions {
  region?: string;
  departement?: string;
}

export async function fetchEtablissements(
  _options: FetchOptions
): Promise<Etablissement[]> {
  return [];
}
