import "dotenv/config";

// --- Constantes ---

const SIRENE_BASE_URL =
  "https://api.insee.fr/entreprises/sirene/V3.11/siret";

const NAF_CODES = ["10.71C", "10.71D"];
const TRANCHES_EFFECTIF = ["12", "21", "22", "31"];
const PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

const REGIONS_DEPARTEMENTS: Record<string, string[]> = {
  "auvergne-rhone-alpes": [
    "01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74",
  ],
  "bourgogne-franche-comte": ["21", "25", "39", "58", "70", "71", "89", "90"],
  bretagne: ["22", "29", "35", "56"],
  "centre-val de loire": ["18", "28", "36", "37", "41", "45"],
  corse: ["2A", "2B"],
  "grand est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "hauts-de-france": ["02", "59", "60", "62", "80"],
  "ile-de-france": ["75", "77", "78", "91", "92", "93", "94", "95"],
  normandie: ["14", "27", "50", "61", "76"],
  "nouvelle-aquitaine": [
    "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
  ],
  occitanie: [
    "09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81",
    "82",
  ],
  "pays de la loire": ["44", "49", "53", "72", "85"],
  "provence-alpes-cote d'azur": ["04", "05", "06", "13", "83", "84"],
  guadeloupe: ["971"],
  martinique: ["972"],
  guyane: ["973"],
  "la reunion": ["974"],
  mayotte: ["976"],
};

// --- Types ---

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

// --- Helpers ---

function normalizeRegion(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDepartements(options: FetchOptions): string[] | null {
  if (options.departement) {
    const dep = options.departement.padStart(2, "0");
    return [dep];
  }

  if (options.region) {
    const key = normalizeRegion(options.region);
    const deps = REGIONS_DEPARTEMENTS[key];
    if (!deps) {
      throw new Error(
        `Region inconnue : "${options.region}". Regions disponibles : ${Object.keys(REGIONS_DEPARTEMENTS).join(", ")}`
      );
    }
    return deps;
  }

  return null;
}

function buildQuery(departements: string[] | null): string {
  const nafFilter = NAF_CODES.map(
    (c) => `activitePrincipaleEtablissement:"${c}"`
  ).join(" OR ");

  const effectifFilter = TRANCHES_EFFECTIF.map(
    (t) => `trancheEffectifsEtablissement:${t}`
  ).join(" OR ");

  let query = `(${nafFilter}) AND (${effectifFilter}) AND etatAdministratifEtablissement:A`;

  if (departements) {
    const geoFilter = departements
      .map((d) => `codeCommuneEtablissement:${d}*`)
      .join(" OR ");
    query += ` AND (${geoFilter})`;
  }

  return query;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers });

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `SIRENE API — HTTP ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `SIRENE API — erreur reseau, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }

  return fetch(url, { headers });
}

// --- Mapping ---

interface SireneEtablissement {
  siret: string;
  uniteLegale: {
    denominationUniteLegale: string | null;
    nomUniteLegale: string | null;
    prenomUsuelUniteLegale: string | null;
  };
  adresseEtablissement: {
    numeroVoieEtablissement: string | null;
    typeVoieEtablissement: string | null;
    libelleVoieEtablissement: string | null;
    libelleCommuneEtablissement: string | null;
    codePostalEtablissement: string | null;
    codeCommuneEtablissement: string | null;
  };
  trancheEffectifsEtablissement: string;
  activitePrincipaleEtablissement: string;
}

function mapEtablissement(raw: SireneEtablissement): Etablissement {
  const ul = raw.uniteLegale;
  const adr = raw.adresseEtablissement;

  const nom =
    ul.denominationUniteLegale ??
    [ul.prenomUsuelUniteLegale, ul.nomUniteLegale].filter(Boolean).join(" ");

  const adresse = [
    adr.numeroVoieEtablissement,
    adr.typeVoieEtablissement,
    adr.libelleVoieEtablissement,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    siret: raw.siret,
    nom: nom || "Inconnu",
    adresse,
    ville: adr.libelleCommuneEtablissement || "",
    codePostal: adr.codePostalEtablissement || "",
    effectifTranche: raw.trancheEffectifsEtablissement,
    codeNaf: raw.activitePrincipaleEtablissement,
  };
}

// --- Fonction principale ---

interface SireneResponse {
  header: { total: number; debut: number; nombre: number };
  etablissements: SireneEtablissement[];
}

export async function fetchEtablissements(
  options: FetchOptions
): Promise<Etablissement[]> {
  const token = process.env.SIRENE_TOKEN;
  if (!token) {
    throw new Error("SIRENE_TOKEN manquant dans les variables d'environnement");
  }

  const departements = getDepartements(options);
  const query = buildQuery(departements);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const etablissements: Etablissement[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      q: query,
      nombre: String(PAGE_SIZE),
      debut: String(offset),
    });

    const url = `${SIRENE_BASE_URL}?${params}`;
    const response = await fetchWithRetry(url, headers);

    if (response.status === 404) {
      break;
    }

    if (!response.ok) {
      throw new Error(
        `SIRENE API — HTTP ${response.status}: ${await response.text()}`
      );
    }

    const data = (await response.json()) as SireneResponse;

    for (const raw of data.etablissements) {
      etablissements.push(mapEtablissement(raw));
    }

    offset += PAGE_SIZE;
    if (offset >= data.header.total) {
      break;
    }
  }

  return etablissements;
}
