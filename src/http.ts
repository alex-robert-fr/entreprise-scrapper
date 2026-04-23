const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retente sur les statuts retryables (429, 5xx). Retourne la Response sans la valider — l'appelant doit vérifier response.ok. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      lastResponse = response;
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    } catch (err) {
      if (attempt >= MAX_RETRIES - 1) throw err;
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  throw new Error(
    `fetchWithRetry: échec après ${MAX_RETRIES} tentatives — HTTP ${lastResponse?.status ?? "réseau"}`
  );
}
