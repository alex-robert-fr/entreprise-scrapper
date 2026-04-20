# Scraper — Pâtissiers/Boulangers 15+ salariés

Crée une application Node.js + TypeScript avec une interface web simple (dashboard) ET une CLI qui scrape des numéros de téléphone de pâtissiers/boulangers français ayant 15+ salariés.

## Pipeline

1. **SIRENE API (INSEE)** → récupérer les établissements ciblés
2. **Google Maps Places API** → enrichir avec le numéro de téléphone
3. **Pages Jaunes (fallback)** → pour les établissements sans résultat Google
4. **Déduplication** → vérifier que le SIRET n'est pas déjà dans la base avant de scraper
5. **Export CSV** → résultat final propre

## Stack

- Node.js + TypeScript
- `fetch` natif Node 18+ pour les appels HTTP (pas de dépendance externe)
- `playwright` pour le scraping Pages Jaunes
- `csv-writer` pour l'export CSV
- `dotenv` pour les clés API
- `ora` pour le spinner / progress bar CLI
- `express` pour le serveur du dashboard web
- `drizzle-orm` + `postgres` (postgres-js) pour la DB, `drizzle-kit` pour les migrations
- `docker compose` pour Postgres 16 local (port 5433)

## Codes NAF ciblés

- `1071C` — Boulangerie-pâtisserie
- `1071D` — Pâtisserie

## Tranches d'effectif SIRENE (15+ salariés)

Codes INSEE officiels (voir `src/db/scraped.ts:EFFECTIF_LABELS`) :

- `11` → 10 à 19 salariés
- `12` → 20 à 49 salariés
- `21` → 50 à 99 salariés
- `22` → 100 à 199 salariés
- `31` → 200 à 249 salariés
- `32` → 250 à 499 salariés

## Structure du projet

```
scraper/
├── .env
├── .env.example
├── docker-compose.yml      # Postgres local (port 5433)
├── drizzle.config.ts       # Config drizzle-kit
├── drizzle/                # Migrations SQL versionnées
├── exports/                # CSVs générés
├── src/
│   ├── main.ts             # CLI entrypoint avec minimist
│   ├── server.ts           # Serveur Express pour le dashboard
│   ├── sirene.ts           # Appels API INSEE SIRENE
│   ├── googleMaps.ts       # Google Maps Places API
│   ├── pipeline.ts         # Orchestration des 3 sources
│   ├── exporter.ts         # Export CSV
│   ├── db/
│   │   ├── schema.ts       # Tables Drizzle (scraped_records, phone_cache, credits...)
│   │   ├── client.ts       # Connexion Postgres singleton
│   │   ├── scraped.ts      # Queries scraped_records/excluded (ex-dedup.ts)
│   │   ├── phoneCache.ts   # Cache mutualisé TTL 90j
│   │   └── index.ts        # Barrel
│   └── public/
│       └── index.html      # Dashboard web (HTML/CSS/JS vanilla, pas de framework)
├── tsconfig.json
└── package.json
```

## Système de déduplication (src/db/scraped.ts)

Utiliser **Postgres via Drizzle ORM** (table `scraped_records`, définie dans `src/db/schema.ts`).

- Avant chaque scrape → `isKnownByUser(userId, siret)` vérifie dans `scraped_records` (scope user) **et** `excluded` (global)
- Si oui → skip silencieux, incrémenter un compteur `already_known`
- Si non → scraper, puis `insert(record)` avec `onConflictDoNothing`
- La DB persiste entre les runs → relancer le script ne re-scrape jamais un établissement déjà traité
- Les SIRET nettoyés lors des passes de doublons sont archivés dans `excluded` (ils ne seront plus jamais scrapés)

## Dashboard web (src/public/index.html)

Interface minimaliste en HTML/CSS/JS vanilla accessible sur `http://localhost:3000`.

Fonctionnalités :

- **Statistiques en temps réel** : total scrapé, trouvés, non trouvés, doublons évités
- **Lancer un scrape** depuis l'UI : choisir région ou département via un formulaire
- **Tableau des résultats** : liste paginée des derniers prospects récupérés (nom, ville, téléphone, source)
- **Bouton export CSV** : télécharger les résultats filtrés directement depuis le browser
- **Indicateur de statut** : idle / en cours / terminé avec progress en %

Design : dark mode simple, sobre, pas de framework CSS.

## Comportement CLI attendu

- `npx ts-node src/main.ts --region "Bretagne"` → scrape une région
- `npx ts-node src/main.ts --departement 29` → scrape un département
- `npx ts-node src/main.ts --all` → scrape toute la France
- `npx ts-node src/server.ts` → démarre le dashboard sur le port 3000
- Afficher un spinner `ora` avec le nom de l'établissement en cours
- Logger les établissements non trouvés dans `exports/not_found.csv`
- Respecter un délai de 1-2s entre les requêtes Pages Jaunes
- Gérer les erreurs réseau avec retry (3 tentatives max)
- Afficher un résumé à la fin : `X nouveaux | Y déjà connus | Z non trouvés`

## Output CSV

Colonnes : `siret, nom, adresse, ville, code_postal, telephone, effectif_tranche, source, scraped_at`

Valeurs possibles pour `source` : `google`, `pagesjaunes`, `non_trouvé`

## Variables d'environnement

Créer un fichier `.env.example` avec :

```
SIRENE_TOKEN=xxx
GOOGLE_MAPS_API_KEY=xxx
PORT=3000
```

## Instructions

Commence par créer la structure du projet et le `package.json`, puis implémente dans cet ordre :

1. `src/db/schema.ts` + `src/db/client.ts` — la couche DB en premier, tout le reste en dépend
2. `sirene.ts`
3. `googleMaps.ts`
4. `pagesJaunes.ts`
5. `pipeline.ts`
6. `exporter.ts`
7. `main.ts`
8. `server.ts` + `public/index.html`

## Git

### Branches

Format : `type/numero-titre-court`

| Préfixe | Usage |
|---------|-------|
| `feat/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug |
| `refactor/` | Refactoring |
| `chore/` | Maintenance / config |

Le titre court est en **kebab-case**, en **anglais**, max 5 mots.

### Commits

Format : `emoji type(scope): description en français`

| Emoji | Type | Usage |
|-------|------|-------|
| ✨ | feat | Nouvelle fonctionnalité |
| 🐛 | fix | Correction de bug |
| ♻️ | refactor | Refactoring |
| 🔧 | chore | Maintenance / config |

- **Pas de signature** `Co-Authored-By` dans les commits

### Pull Requests

Format titre : `[Type] Titre de l'issue (#numero)`
