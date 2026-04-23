import { fetchWithRetry } from "./http";

// Places API (New) — https://developers.google.com/maps/documentation/places/web-service/text-search
const PLACES_NEW_BASE_URL = "https://places.googleapis.com/v1/places";

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

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Google Maps — clé API invalide ou quota dépassé (HTTP ${response.status})`);
  }
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
    `${PLACES_NEW_BASE_URL}/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber",
      },
    }
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Google Maps — clé API invalide ou quota dépassé (HTTP ${response.status})`);
  }
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
