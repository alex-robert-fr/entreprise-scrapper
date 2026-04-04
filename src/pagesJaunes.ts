import { chromium, Browser } from "playwright";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const POLITENESS_MIN = 1000;
const POLITENESS_MAX = 2000;
const NAV_TIMEOUT = 15_000;
const PJ_SEARCH_URL =
  "https://www.pagesjaunes.fr/annuaire/chercherlespros";

const SELECTORS = {
  result: ".bi-content",
  showPhoneBtn: ".bi-clic-tel .pj-link",
  phoneNumber: ".bi-clic-tel .coord-val",
  noResults: ".noResults",
} as const;

// --- Singleton browser ---

let browser: Browser | null = null;

async function ensureBrowser(): Promise<Browser> {
  if (!browser) {
    const opts: Parameters<typeof chromium.launch>[0] = { headless: true };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    browser = await chromium.launch(opts);
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// --- Helpers ---

function politenessDelay(): Promise<void> {
  const delay =
    POLITENESS_MIN + Math.random() * (POLITENESS_MAX - POLITENESS_MIN);
  return new Promise((r) => setTimeout(r, delay));
}

// --- Scraping (une tentative) ---

async function scrapePhone(
  nom: string,
  ville: string
): Promise<string | null> {
  const b = await ensureBrowser();
  const page = await b.newPage();

  try {
    const url = `${PJ_SEARCH_URL}?quoiqui=${encodeURIComponent(nom)}&ou=${encodeURIComponent(ville)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    // Pas de résultat ?
    const noResults = await page.$(SELECTORS.noResults);
    if (noResults) return null;

    // Attendre au moins un résultat
    const firstResult = await page.waitForSelector(SELECTORS.result, {
      timeout: 5000,
    }).catch(() => null);
    if (!firstResult) return null;

    // Cliquer sur "Afficher le N°" dans le premier résultat
    const showBtn = await firstResult.$(SELECTORS.showPhoneBtn);
    if (showBtn) {
      await showBtn.click();
      // Attendre que le numéro s'affiche
      await page.waitForSelector(SELECTORS.phoneNumber, { timeout: 3000 }).catch(() => null);
    }

    // Extraire le numéro
    const phoneEl = await firstResult.$(SELECTORS.phoneNumber);
    if (!phoneEl) return null;

    const rawPhone = await phoneEl.textContent();
    if (!rawPhone) return null;

    const phone = rawPhone.replace(/\s+/g, "").trim();
    return phone || null;
  } finally {
    await page.close();
  }
}

// --- Fonction publique avec retry ---

export async function findPhonePJ(
  nom: string,
  ville: string
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await politenessDelay();
      return await scrapePhone(nom, ville);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `Pages Jaunes — erreur pour "${nom}" à ${ville}, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms : ${message}`
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.warn(
          `Pages Jaunes — échec définitif pour "${nom}" à ${ville} : ${message}`
        );
      }
    }
  }

  return null;
}
