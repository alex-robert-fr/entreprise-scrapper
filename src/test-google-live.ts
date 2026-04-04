import "dotenv/config";
import { findPhoneGoogle } from "./googleMaps";

const CASES = [
  { nom: "Boulangerie Paul", ville: "Paris" },
  { nom: "Pâtisserie Ladurée", ville: "Paris" },
  { nom: "Boulangerie Poilâne", ville: "Paris" },
];

(async () => {
  console.log("=== Test live Google Maps Places API ===\n");

  for (const { nom, ville } of CASES) {
    process.stdout.write(`${nom} (${ville}) → `);
    const tel = await findPhoneGoogle(nom, ville);
    console.log(tel ?? "non trouvé");
  }
})();
