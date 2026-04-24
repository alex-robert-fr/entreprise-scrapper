import { fetchWithRetry } from "./http.js";

const BASE_URL = "https://recherche-entreprises.api.gouv.fr/search";

interface Dirigeant {
  nom: string;
  prenoms: string;
  qualite: string;
}

interface SearchResult {
  results?: Array<{ dirigeants?: Dirigeant[] }>;
}

function formatDirigeants(dirigeants: Dirigeant[]): string {
  return dirigeants
    .map((d) => {
      const prenoms = d.prenoms ? d.prenoms.trim() : "";
      const nom = d.nom ? d.nom.trim() : "";
      const qualite = d.qualite ? d.qualite.trim() : "";
      const fullName = [prenoms, nom].filter(Boolean).join(" ");
      return qualite ? `${fullName} (${qualite})` : fullName;
    })
    .filter(Boolean)
    .join(", ");
}

export async function fetchDirigeants(siren: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(`${BASE_URL}?q=${encodeURIComponent(siren)}`);
    if (!response.ok) {
      console.warn(`Annuaire Entreprises — HTTP ${response.status} pour SIREN ${siren}`);
      return null;
    }

    const data = (await response.json()) as SearchResult;
    const dirigeants = data.results?.[0]?.dirigeants;
    if (!dirigeants || dirigeants.length === 0) return null;

    const formatted = formatDirigeants(dirigeants);
    return formatted || null;
  } catch (err) {
    console.warn(
      `Annuaire Entreprises — erreur pour SIREN ${siren} :`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
