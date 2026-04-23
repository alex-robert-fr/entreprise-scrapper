import "dotenv/config";

// --- Constantes ---

const SIRENE_BASE_URL = "https://api.insee.fr/api-sirene/3.11/siret";

export const DEFAULT_NAF_CODES = ["1071C", "1071D"];

export function normalizeNafCode(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.includes(".")) return trimmed;
  if (trimmed.length < 3) return trimmed;
  return `${trimmed.slice(0, 2)}.${trimmed.slice(2)}`;
}

const FORMES_JURIDIQUES: Record<string, string> = {
  "1000": "EI",
  "5410": "SARL",
  "5499": "SARL unipersonnelle",
  "5710": "SAS",
  "5720": "SASU",
};

// Tranches d'effectif : [11 TO 53] couvre 10+ salariés (11=10-19, 12=20-49, ...)
const TRANCHE_MIN = "11";
const TRANCHE_MAX = "53";
const PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

export const REGIONS_DEPARTEMENTS: Record<string, string[]> = {
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
    "09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82",
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
  formeJuridique: string;
}

export interface FetchOptions {
  region?: string;
  departement?: string;
  nafCodes?: string[];
}

// --- Helpers ---

export function normalizeRegion(name: string): string {
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

// Construit la requête Lucene pour un code NAF donné.
// activitePrincipaleEtablissement et etatAdministratifEtablissement
// doivent impérativement être dans periode() — sinon HTTP 400.
function buildQuery(nafCode: string, departements: string[] | null): string {
  let query = `periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:${nafCode})`;
  query += ` AND trancheEffectifsEtablissement:[${TRANCHE_MIN} TO ${TRANCHE_MAX}]`;

  if (departements) {
    const geoFilter = departements
      .map((d) => `codePostalEtablissement:${d}*`)
      .join(" OR ");
    query += ` AND (${geoFilter})`;
  }

  return query;
}

// Construit l'URL en préservant les caractères Lucene (: ( ) [ ] *)
// encodeURIComponent encode les deux-points en %3A que l'API ne supporte pas.
function buildUrl(query: string, curseur: string): string {
  const encoded = encodeURIComponent(query)
    .replace(/%3A/gi, ":")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2A/g, "*")
    .replace(/%5B/g, "[")
    .replace(/%5D/g, "]");
  return `${SIRENE_BASE_URL}?q=${encoded}&nombre=${PAGE_SIZE}&curseur=${encodeURIComponent(curseur)}`;
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
        console.warn(`SIRENE — HTTP ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(`SIRENE — erreur réseau, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  return fetch(url, { headers });
}

// --- Mapping ---

interface SireneAdresse {
  numeroVoieEtablissement: string | null;
  typeVoieEtablissement: string | null;
  libelleVoieEtablissement: string | null;
  libelleCommuneEtablissement: string | null;
  codePostalEtablissement: string | null;
}

interface SireneUniteLegale {
  denominationUniteLegale: string | null;
  nomUniteLegale: string | null;
  prenom1UniteLegale: string | null;
  categorieJuridiqueUniteLegale: string | null;
}

interface SirenePeriode {
  activitePrincipaleEtablissement: string | null;
}

interface SireneEtablissement {
  siret: string;
  trancheEffectifsEtablissement: string;
  uniteLegale: SireneUniteLegale;
  adresseEtablissement: SireneAdresse;
  periodesEtablissement: SirenePeriode[];
}

interface SireneResponse {
  header: {
    statut: number;
    total: number;
    curseurSuivant?: string;
  };
  etablissements: SireneEtablissement[];
}

function mapEtablissement(raw: SireneEtablissement): Etablissement {
  const ul = raw.uniteLegale;
  const adr = raw.adresseEtablissement;
  const periode = raw.periodesEtablissement?.[0];

  const nom =
    ul.denominationUniteLegale ??
    [ul.prenom1UniteLegale, ul.nomUniteLegale].filter(Boolean).join(" ");

  const adresse = [
    adr.numeroVoieEtablissement,
    adr.typeVoieEtablissement,
    adr.libelleVoieEtablissement,
  ]
    .filter(Boolean)
    .join(" ");

  const codeJuridique = ul.categorieJuridiqueUniteLegale || "";
  const formeJuridique = FORMES_JURIDIQUES[codeJuridique] ?? codeJuridique;

  return {
    siret: raw.siret,
    nom: nom || "Inconnu",
    adresse,
    ville: adr.libelleCommuneEtablissement || "",
    codePostal: adr.codePostalEtablissement || "",
    effectifTranche: raw.trancheEffectifsEtablissement,
    codeNaf: periode?.activitePrincipaleEtablissement || "",
    formeJuridique,
  };
}

// --- Fonction principale ---

async function* streamForNaf(
  nafCode: string,
  departements: string[] | null,
  headers: Record<string, string>
): AsyncGenerator<Etablissement> {
  const query = buildQuery(nafCode, departements);
  let curseur = "*";

  while (true) {
    const url = buildUrl(query, curseur);
    const response = await fetchWithRetry(url, headers);

    if (response.status === 404) break;

    if (!response.ok) {
      throw new Error(`SIRENE — HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as SireneResponse;

    if (!data.etablissements?.length) break;

    for (const raw of data.etablissements) {
      yield mapEtablissement(raw);
    }

    const next = data.header.curseurSuivant;
    if (!next || next === curseur) break;
    curseur = next;
  }
}

export async function* streamEtablissements(
  options: FetchOptions
): AsyncGenerator<Etablissement> {
  const token = process.env.SIRENE_TOKEN;
  if (!token) {
    throw new Error("SIRENE_TOKEN manquant dans les variables d'environnement");
  }

  const headers: Record<string, string> = {
    "X-INSEE-Api-Key-Integration": token,
    Accept: "application/json",
  };

  const departements = getDepartements(options);
  const seen = new Set<string>();
  const nafCodes = (options.nafCodes?.length ? options.nafCodes : DEFAULT_NAF_CODES).map(normalizeNafCode);

  for (const nafCode of nafCodes) {
    for await (const etab of streamForNaf(nafCode, departements, headers)) {
      if (!seen.has(etab.siret)) {
        seen.add(etab.siret);
        yield etab;
      }
    }
  }
}

export async function fetchEtablissements(
  options: FetchOptions
): Promise<Etablissement[]> {
  const all: Etablissement[] = [];
  for await (const etab of streamEtablissements(options)) {
    all.push(etab);
  }
  return all;
}
