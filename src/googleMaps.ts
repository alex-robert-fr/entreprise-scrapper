// Places API (New) — https://developers.google.com/maps/documentation/places/web-service/text-search
const PLACES_NEW_BASE_URL = "https://places.googleapis.com/v1/places";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// --- Retry HTTP ---

async function fetchWithRetry(
  url: string,
  init?: RequestInit
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
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
  return fetch(url, init);
}

// --- Types Places API (New) ---

interface TextSearchResponse {
  places?: Array<{ id: string }>;
}

interface PlaceDetailsResponse {
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
}

// --- Text Search (New) ---

async function searchPlace(
  nom: string,
  ville: string,
  apiKey: string
): Promise<string | null> {
  const response = await fetchWithRetry(`${PLACES_NEW_BASE_URL}:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({ textQuery: `${nom} ${ville}` }),
  });

  if (!response.ok) {
    console.warn(`Google Maps Text Search — HTTP ${response.status}`);
    return null;
  }

  const data = (await response.json()) as TextSearchResponse;
  return data.places?.[0]?.id ?? null;
}

// --- Place Details (New) ---

async function getPhoneNumber(
  placeId: string,
  apiKey: string
): Promise<string | null> {
  const response = await fetchWithRetry(
    `${PLACES_NEW_BASE_URL}/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber",
      },
    }
  );

  if (!response.ok) {
    console.warn(`Google Maps Place Details — HTTP ${response.status}`);
    return null;
  }

  const data = (await response.json()) as PlaceDetailsResponse;
  return data.nationalPhoneNumber ?? data.internationalPhoneNumber ?? null;
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
