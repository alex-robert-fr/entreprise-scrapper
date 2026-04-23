const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init?: RequestInit
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) =>
          setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        );
      }
    } catch (err) {
      if (attempt >= MAX_RETRIES - 1) throw err;
      await new Promise((r) =>
        setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
      );
    }
  }
  return fetch(url, init);
}
