import type { Db } from "../client";
import { professions, type NewProfession } from "../schema";

// Codes NAF stockés sans point pour matcher directement SIRENE (ex: "1071C", pas "10.71C").
export const PROFESSIONS_SEED: NewProfession[] = [
  { slug: "boulanger",     libelle: "Boulangerie-Pâtisserie",     nafCodes: ["1071C", "1071D"], category: "Alimentation", active: true },
  { slug: "restaurateur",  libelle: "Restauration traditionnelle", nafCodes: ["5610A"],          category: "Alimentation", active: true },
  { slug: "boucher",       libelle: "Boucherie-Charcuterie",      nafCodes: ["4722Z", "1013B"], category: "Alimentation", active: true },

  { slug: "fleuriste",     libelle: "Fleuriste",                   nafCodes: ["4776Z"],          category: "Commerce",     active: true },

  { slug: "plombier",      libelle: "Plombier-Chauffagiste",       nafCodes: ["4322A", "4322B"], category: "BTP",          active: true },
  { slug: "macon",         libelle: "Maçon",                       nafCodes: ["4399C", "4120A"], category: "BTP",          active: true },
  { slug: "electricien",   libelle: "Électricien",                 nafCodes: ["4321A"],          category: "BTP",          active: true },
  { slug: "menuisier",     libelle: "Menuiserie",                  nafCodes: ["4332A", "1623Z"], category: "BTP",          active: true },

  { slug: "garagiste",     libelle: "Garage automobile",           nafCodes: ["4520A", "4520B"], category: "Automobile",   active: true },
  { slug: "auto-ecole",    libelle: "Auto-école",                  nafCodes: ["8553Z"],          category: "Automobile",   active: true },

  { slug: "pharmacien",    libelle: "Pharmacie",                   nafCodes: ["4773Z"],          category: "Sante",        active: true },
  { slug: "dentiste",      libelle: "Cabinet dentaire",            nafCodes: ["8623Z"],          category: "Sante",        active: true },
  { slug: "medecin",       libelle: "Cabinet médical",             nafCodes: ["8621Z"],          category: "Sante",        active: true },
  { slug: "veterinaire",   libelle: "Vétérinaire",                 nafCodes: ["7500Z"],          category: "Sante",        active: true },
  { slug: "opticien",      libelle: "Opticien",                    nafCodes: ["4778A"],          category: "Sante",        active: true },

  { slug: "coiffeur",      libelle: "Coiffure",                    nafCodes: ["9602A"],          category: "Beaute",       active: true },

  { slug: "avocat",        libelle: "Avocat",                      nafCodes: ["6910Z"],          category: "Services",     active: true },
  { slug: "comptable",     libelle: "Expert-comptable",            nafCodes: ["6920Z"],          category: "Services",     active: true },
  { slug: "architecte",    libelle: "Architecte",                  nafCodes: ["7111Z"],          category: "Services",     active: true },
  { slug: "agence-immo",   libelle: "Agence immobilière",          nafCodes: ["6831Z"],          category: "Services",     active: true },
];

const NAF_CODE_REGEX = /^\d{4}[A-Z]$/;

export async function seedProfessions(database: Db): Promise<{ inserted: number; skipped: number }> {
  for (const p of PROFESSIONS_SEED) {
    for (const code of p.nafCodes) {
      if (!NAF_CODE_REGEX.test(code)) {
        throw new Error(`Code NAF invalide pour "${p.slug}" : "${code}" — format attendu ^\\d{4}[A-Z]$`);
      }
    }
  }

  const rows = await database
    .insert(professions)
    .values(PROFESSIONS_SEED)
    .onConflictDoNothing({ target: professions.slug })
    .returning({ slug: professions.slug });

  return { inserted: rows.length, skipped: PROFESSIONS_SEED.length - rows.length };
}
