const BASE_URL = "https://recherche-entreprises.api.gouv.fr/search";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface Dirigeant {
  nom: string;
  prenoms: string;
  qualite: string;
}

interface SearchResult {
  results?: Array<{ dirigeants?: Dirigeant[] }>;
}

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `Annuaire Entreprises — HTTP ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `Annuaire Entreprises — erreur réseau, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  return fetch(url);
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
