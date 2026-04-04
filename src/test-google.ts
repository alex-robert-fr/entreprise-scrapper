import { findPhoneGoogle } from "./googleMaps";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function mockFetch(textSearchBody: object, detailsBody: object): void {
  (global as { fetch: typeof fetch }).fetch = async (input) => {
    const u = input.toString();
    const body = u.includes("textsearch") ? textSearchBody : detailsBody;
    return { ok: true, json: async () => body } as Response;
  };
}

// --- cas 1 : numéro trouvé ---
async function testNumeroTrouve(): Promise<void> {
  console.log("\ncas 1 : numéro trouvé");
  mockFetch(
    { status: "OK", results: [{ place_id: "ChIJ_fake" }] },
    { status: "OK", result: { formatted_phone_number: "+33 1 23 45 67 89" } }
  );
  process.env.GOOGLE_MAPS_API_KEY = "fake-key";
  const tel = await findPhoneGoogle("Boulangerie Test", "Paris");
  assert(tel === "+33 1 23 45 67 89", `retourne "${tel}"`);
}

// --- cas 2 : ZERO_RESULTS sur Text Search ---
async function testZeroResults(): Promise<void> {
  console.log("\ncas 2 : ZERO_RESULTS sur Text Search");
  mockFetch(
    { status: "ZERO_RESULTS", results: [] },
    { status: "OK", result: { formatted_phone_number: "+33 9 99 99 99 99" } }
  );
  process.env.GOOGLE_MAPS_API_KEY = "fake-key";
  const tel = await findPhoneGoogle("Inconnu", "Nulle Part");
  assert(tel === null, "retourne null");
}

// --- cas 3 : place trouvée mais pas de téléphone ---
async function testSanstelephone(): Promise<void> {
  console.log("\ncas 3 : place trouvée sans téléphone");
  mockFetch(
    { status: "OK", results: [{ place_id: "ChIJ_fake" }] },
    { status: "OK", result: {} }
  );
  process.env.GOOGLE_MAPS_API_KEY = "fake-key";
  const tel = await findPhoneGoogle("Pâtisserie Vide", "Lyon");
  assert(tel === null, "retourne null");
}

// --- cas 4 : clé API manquante ---
async function testSansCle(): Promise<void> {
  console.log("\ncas 4 : clé API manquante");
  delete process.env.GOOGLE_MAPS_API_KEY;
  const tel = await findPhoneGoogle("Test", "Bordeaux");
  assert(tel === null, "retourne null sans planter");
}

// --- cas 5 : erreur réseau (fetch lève une exception) ---
async function testErreurReseau(): Promise<void> {
  console.log("\ncas 5 : erreur réseau (toutes les tentatives échouent)");
  process.env.GOOGLE_MAPS_API_KEY = "fake-key";
  (global as { fetch: typeof fetch }).fetch = async () => {
    throw new Error("Network failure");
  };
  const tel = await findPhoneGoogle("Boulangerie Crash", "Marseille");
  assert(tel === null, "retourne null sans planter");
}

// --- cas 6 : quota dépassé (statut API REQUEST_DENIED) ---
async function testRequestDenied(): Promise<void> {
  console.log("\ncas 6 : statut REQUEST_DENIED (quota / clé invalide)");
  mockFetch(
    { status: "REQUEST_DENIED", results: [] },
    { status: "OK", result: { formatted_phone_number: "+33 0 00 00 00 00" } }
  );
  process.env.GOOGLE_MAPS_API_KEY = "fake-key";
  const tel = await findPhoneGoogle("Test Quota", "Nice");
  assert(tel === null, "retourne null");
}

// --- runner ---
(async () => {
  console.log("=== Tests googleMaps.ts ===");
  await testNumeroTrouve();
  await testZeroResults();
  await testSanstelephone();
  await testSansCle();
  await testErreurReseau();
  await testRequestDenied();
  console.log(`\n${passed + failed} tests — ${passed} passés, ${failed} échoués`);
  if (failed > 0) process.exit(1);
})();
