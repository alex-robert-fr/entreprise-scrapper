const PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// --- Retry HTTP ---

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
          `Google Maps — HTTP ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `Google Maps — erreur réseau, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  return fetch(url);
}

// --- Types API Google Places ---

interface TextSearchResponse {
  status: string;
  results: Array<{ place_id: string }>;
}

interface PlaceDetailsResponse {
  status: string;
  result?: { formatted_phone_number?: string };
}

// --- Text Search ---

async function searchPlace(
  nom: string,
  ville: string,
  apiKey: string
): Promise<string | null> {
  const query = encodeURIComponent(`${nom} ${ville}`);
  const url = `${PLACES_BASE_URL}/textsearch/json?query=${query}&key=${apiKey}`;

  const response = await fetchWithRetry(url);
  if (!response.ok) {
    console.warn(`Google Maps Text Search — HTTP ${response.status}`);
    return null;
  }

  const data = (await response.json()) as TextSearchResponse;

  if (data.status !== "OK") {
    if (data.status !== "ZERO_RESULTS") {
      console.warn(`Google Maps Text Search — statut API : ${data.status}`);
    }
    return null;
  }

  return data.results[0]?.place_id ?? null;
}

// --- Place Details ---

async function getPhoneNumber(
  placeId: string,
  apiKey: string
): Promise<string | null> {
  const url = `${PLACES_BASE_URL}/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_phone_number&key=${apiKey}`;

  const response = await fetchWithRetry(url);
  if (!response.ok) {
    console.warn(`Google Maps Place Details — HTTP ${response.status}`);
    return null;
  }

  const data = (await response.json()) as PlaceDetailsResponse;

  if (data.status !== "OK") {
    if (data.status !== "ZERO_RESULTS") {
      console.warn(`Google Maps Place Details — statut API : ${data.status}`);
    }
    return null;
  }

  return data.result?.formatted_phone_number ?? null;
}

// --- Fonction publique ---

export async function findPhoneGoogle(
  nom: string,
  ville: string
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("Google Maps — GOOGLE_MAPS_API_KEY manquante, skip");
    return null;
  }

  try {
    const placeId = await searchPlace(nom, ville, apiKey);
    if (!placeId) return null;

    return await getPhoneNumber(placeId, apiKey);
  } catch (err) {
    console.warn(
      `Google Maps — erreur pour "${nom}" à ${ville} :`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
