import "dotenv/config";
import { fetchEtablissements } from "./sirene";

async function main() {
  console.log("Test SIRENE — département 29, 2 premiers résultats...\n");

  const token = process.env.SIRENE_TOKEN;
  if (!token) {
    console.error("SIRENE_TOKEN manquant dans .env");
    process.exit(1);
  }

  // Test brut pour voir la réponse complète de l'API
  const query = "periode(etatAdministratifEtablissement:A AND activitePrincipaleEtablissement:10.71C) AND trancheEffectifsEtablissement:[11 TO 53] AND (codePostalEtablissement:29*)";
  const encoded = encodeURIComponent(query)
    .replace(/%3A/gi, ":")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2A/g, "*")
    .replace(/%5B/g, "[")
    .replace(/%5D/g, "]");
  const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encoded}&nombre=2&curseur=*`;

  console.log("URL:", url);
  const resp = await fetch(url, {
    headers: { "X-INSEE-Api-Key-Integration": token, Accept: "application/json" },
  });
  console.log("HTTP:", resp.status);
  const text = await resp.text();
  console.log("Réponse brute:");
  console.log(text.slice(0, 1500));

  // Test via la fonction principale
  console.log("\n\n--- Test fetchEtablissements({ departement: '29' }) ---");
  const etabs = await fetchEtablissements({ departement: "29" });
  console.log(`Total : ${etabs.length}`);
  if (etabs.length > 0) console.log("Premier :", etabs[0]);
}

main().catch(console.error);
