# Technical Changes

All notable technical changes targeted at contributors will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Refactor

- `src/db/credits.ts` : `adminGrant` étendu pour accepter les débits (`amount < 0`) et tracer obligatoirement `adminId`/`note` dans la colonne `metadata` ([`48d822e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/48d822e))
- `src/middleware/auth.ts` : factorisation de `makeAdminGuard(onUnauth, onForbidden)` pour dériver `requireAdminAuth` et `adminDashboardGuard` sans duplication ([`ea590e4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/ea590e4))
- `src/db/admin.ts` : sous-requêtes SQL inlinées dans `listUsers`/`getUserDetail` ; `transactionLimit` paramétrable dans `getUserDetail` (défaut 50) ([`ea590e4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/ea590e4))
- `src/server.ts` : `ScrapeState.status` étendu avec `"stopped_no_credits"` (pipeline arrêté faute de crédits) et `"error"` (exception inattendue dans le pipeline) ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- Port de `dedup.ts` (SQLite/better-sqlite3) vers `src/db/` avec Drizzle ORM + postgres-js : `scraped.ts`, `phoneCache.ts`, `client.ts`, `index.ts`, `schema.ts` ([`33639a0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/33639a0), [`e30efd0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e30efd0), [`8b7a160`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8b7a160), [`9b0b101`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/9b0b101))
- `getPhoneDuplicates`/`getNameDuplicates` : remplace les N+1 non bornés par une requête unique `inArray` + groupement en mémoire ([`e6909ab`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e6909ab))
- `server.ts` : wrapper `asyncHandler` + middleware d'erreur global sur toutes les routes async (évite le crash du process sur erreur DB non catchée) ([`e6909ab`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e6909ab))
- `phoneUtils.ts` : `phoneTypeCondition` renvoie un fragment `SQL` Drizzle typé au lieu d'une string brute ([`8b7a160`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8b7a160))
- `getFilterOptions` : migration de 4 requêtes raw vers `db.selectDistinct()` typé ([`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))
- `src/middleware/auth.ts` : extraction de `makeAuthGuard(onUnauth)` pour mutualiser `requireAuth` et `dashboardGuard` ; type union `UserRole = "user" | "admin"` + helper `toUserRole` pour normaliser le champ `role` Better Auth ; ajout de `requireAdminAuth` (guard atomique session + rôle) pour les futures routes admin ([`2ec076d`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/2ec076d))
- Pages login/signup déplacées de `src/public/` vers `src/views/` (servies exclusivement via routes Express, non exposées par `express.static`) ; ajout de `alreadyAuthGuard` dans `src/middleware/auth.ts` ; script `build` étendu pour copier `src/views/` vers `dist/views/` ([`43cde21`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/43cde21))
- Ajout de `src/schemas/` (scrape, filters, billing) : schémas Zod centralisés pour tous les inputs HTTP ; middlewares `validateBody`/`validateQuery` qui stockent les données validées dans `res.locals.query` ; `normalizeRegion` exportée depuis `sirene.ts` ([`eba11cb`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/eba11cb))
- `src/db/scraped.ts` : toutes les fonctions publiques reçoivent `userId: string` en premier argument ; `buildWhereClause` filtre systématiquement par `user_id` ; les `DELETE` dans `cleanPhoneDuplicates`/`cleanNameDuplicates` incluent le scope `userId` en défense en profondeur ([`3d004ce`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/3d004ce), [`063fd61`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/063fd61))
- `src/server.ts` : `scrapeState` devient `Map<userId, ScrapeState>` pour isoler le statut de scrape par utilisateur ; `/api/health` bascule sur `SELECT 1` indépendant du scope user ([`8c19bf6`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8c19bf6), [`063fd61`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/063fd61))
- `src/pipeline.ts` : signature `runPipeline(source, userId, onProgress?, limit?)` — `userId` propagé à chaque `ScrapedRecord` inséré ([`3442b43`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/3442b43))
- `src/db/scraped.ts` : `isKnownByUser(userId, siret)` remplace la déduplication globale par SIRET seul ; schéma `scraped_records` passe à une PK composite `(user_id, siret)` avec FK `user_id → user.id` et cascade delete ([#68](https://github.com/alex-robert-fr/entreprise-scrapper/pull/68))
- `src/server.ts` : cleanup périodique de `scrapeStates` (purge toutes les 5 min les états terminés depuis > 1h, `setInterval` avec `.unref()` et désactivé en `NODE_ENV=test`) ; `finishedAt` ajouté à `ScrapeState` pour tracer la fin du scrape ; shutdown propre via `server.close()` sur SIGINT/SIGTERM ; `getScrapeState` retourne une copie de `IDLE_STATE` pour éviter toute mutation partagée ([#69](https://github.com/alex-robert-fr/entreprise-scrapper/pull/69))
- `src/db/professions.ts` : ajout de `listActiveProfessions()` — query Drizzle filtrée sur `active = true`, ordonnée par `category` puis `libelle` ([#71](https://github.com/alex-robert-fr/entreprise-scrapper/pull/71))
- `src/sirene.ts` : `DEFAULT_NAF_CODES` aligné sur le format DB sans point (`["1071C", "1071D"]`) ; `normalizeNafCode` appliquée systématiquement à tous les codes (default et fournis) avant la requête Lucene ; `FetchOptions` étendu avec `nafCodes?: string[]` ([`8aaa9de`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8aaa9de))
- `src/db/professions.ts` : ajout de `getProfessionById(id: number)` ; `src/schemas/scrape.schema.ts` : `professionId` optionnel ajouté au body de scrape ; résolution des codes NAF côté serveur uniquement pour éviter la confiance client ([`96991f1`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/96991f1))
- Centralisation de `fetchWithRetry` dans `src/http.ts` : suppression des 3 implémentations dupliquées dans `sirene.ts`, `googleMaps.ts` et `annuaireEntreprises.ts` ; throw explicite après `MAX_RETRIES` tentatives retryables, `sleep()` dédupliquée ([`7215f1b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/7215f1b))

### Docs

- `DEPLOYMENT.md` : migrations en prod documentées comme automatiques au boot ; avertissement scale horizontal (>1 réplica) ; `PORT` à ne pas définir manuellement sur Railway ; distinction CLI `drizzle-kit` vs runner runtime ([`f909258`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/f909258))
- `DEPLOYMENT.md` : section setup Postgres local (docker compose) + commandes `db:generate`, `db:migrate`, `db:push`, `db:studio` + note migrations en prod ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e))
- `CLAUDE.md` : structure projet et système de déduplication mis à jour ; codes INSEE effectif corrigés (11, 12, 21, 22, 31, 32) ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e), [`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))
- `.claude/skills/tech-stack/SKILL.md` : stack DB mise à jour (Postgres + Drizzle) ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e))
- `.env.example` : `SCRAPE_USER_ID` documenté pour la CLI (usage futur quand `src/main.ts` sera implémenté) ([`1701c1a`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/1701c1a))
- `CLAUDE.md` mis à jour pour refléter `isKnownByUser` comme interface de déduplication ([`a7d0b65`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/a7d0b65))

### Dependencies

- Retrait de `csv-writer`, `minimist`, `ora`, `@types/minimist` (dépendances orphelines depuis la suppression des fichiers CLI) ([`f5032ae`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/f5032ae))
- Retire `better-sqlite3` et `@types/better-sqlite3` ; ajoute `drizzle-orm` + `postgres` (runtime) et `drizzle-kit` (dev) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b))
- Ajout `better-auth@1.6.5` ; bump `drizzle-orm` 0.36 → 0.45 et `drizzle-kit` 0.28 → 0.31 pour compatibilité ([`8847f64`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8847f64))
- Ajout de `zod@4.3.6` ([`1c0e0ee`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/1c0e0ee))

### Chore

- Tokens CSS brass étendus (`--brass-hi`, `--brass-deep`, `--brass-glow`, `--line-brass`) et classes `display-xl`/`display-lg` (Fraunces opsz 144) propagés sur `src/public/index.html` et `src/views/admin.html` ([#89](https://github.com/alex-robert-fr/entreprise-scrapper/pull/89))
- `src/server.ts` : route `GET /billing` ajoutée derrière `dashboardGuard` pour servir `src/views/billing.html` ([#89](https://github.com/alex-robert-fr/entreprise-scrapper/pull/89))
- Migration `0007_peaceful_rocket_raccoon.sql` : colonne `metadata jsonb NULL` ajoutée sur `credit_transactions` pour tracer l'auteur admin et la note de chaque ajustement manuel ([`a348129`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/a348129))
- Nouveau module `src/db/admin.ts` : `listUsers` (pagination, recherche, agrégats balance/achats/fiches) et `getUserDetail` ([`15a8083`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/15a8083))
- Nouveau `src/schemas/admin.schema.ts` : `adminCreditBodySchema` et `adminUsersQuerySchema` (Zod) pour valider les inputs des routes admin ([`42936d3`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/42936d3))
- `src/views/admin.html` déplacé hors de `public/` pour ne pas être exposé par `express.static` ([`ea590e4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/ea590e4))
- `src/server.ts` : commentaire explicite que le pré-check `getBalance` est UX uniquement — la garantie atomique reste la contrainte CHECK Postgres dans `consumeOne` ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- `src/server.ts` : `console.warn` émis si `balance <= 0` pour signaler les cas de row `credits` absente (bug de provisioning) vs solde réellement épuisé ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- Nouveau module `src/db/credits.ts` : services `getBalance`, `getRecentTransactions`, `grantSignupBonus`, `consumeOne`, `adminGrant` + `InsufficientCreditsError` ([`12a7fbf`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/12a7fbf))
- Migration `0006_credit_tx_signup_bonus.sql` : ajout de `signup_bonus` dans le CHECK `credit_tx_type_check` de `credit_transactions` ([`eef50cd`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/eef50cd))
- Migration vers ESM (`"type": "module"` + `tsconfig NodeNext`) : 15 fichiers d'imports suffixés `.js`, `__dirname` remplacé par `fileURLToPath` — résout `ERR_REQUIRE_ESM` au démarrage causé par `better-auth/node` (ESM-only) ([`c522acd`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/c522acd))
- `src/db/migrate.ts` : runner de migration programmatique utilisant `drizzle-orm/postgres-js/migrator` — remplace le recours au CLI `drizzle-kit` (devDependency absent en prod) ; connexion dédiée `max: 1`, fermée après usage ([`4970442`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/4970442))
- `src/server.ts` : migrations Drizzle et seed professions lancés automatiquement au boot avant `app.listen` ; `process.exit(1)` si échec ; `cleanupTimer` déplacé après validation boot ; shutdown propre avec `closeDb()` sur SIGTERM/SIGINT ([`31b876d`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/31b876d), [`ea2422d`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/ea2422d))
- Suppression de `src/main.ts` (CLI jamais implémentée), `src/exporter.ts` (stub vide — export CSV géré par `server.ts`), et tests live obsolètes (`test-google.ts`, `test-google-live.ts`) ; script npm `start` retiré ([`66852de`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/66852de))
- Suppression du dead code `phone_cache` : table retirée du schéma Drizzle, `src/db/phoneCache.ts` supprimé, migration `0003_drop_phone_cache.sql` générée (drop de la table en base) ; remplacé à terme par la table `entreprises` normalisée (#66) ([`2c1957e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/2c1957e))
- `docker-compose.yml` : service Postgres 16-alpine sur le port 5433 (évite tout conflit avec un Postgres système) avec variables d'environnement surchargeables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b), [`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))
- `drizzle.config.ts` : configuration drizzle-kit (schema path, dialect `postgresql`, strict + verbose) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b))
- Migration initiale `drizzle/0000_init.sql` : 6 tables métier (`scraped_records`, `excluded`, `phone_cache`, `professions`, `credits`, `credit_transactions`) + 13 indexes ([`2bf5a30`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/2bf5a30))
- Tables auth Better Auth ajoutées au schéma Drizzle (`user`, `session`, `account`, `verification`) et migration `0001_auth_better_auth.sql` générée avec FK `credits.user_id` et `credit_transactions.user_id` → `user.id` (cascade delete) ([`57a686f`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/57a686f))
- Variable `BETTER_AUTH_TRUSTED_ORIGINS` (CSV) pour configurer plusieurs origines autorisées en plus de `BETTER_AUTH_URL` ([`0f20ef4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/0f20ef4))
- Hook `user.create.after` : gestion d'erreur avec relance et log d'avertissement si conflit sur insert crédits ([`0f20ef4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/0f20ef4))
- Branche par défaut basculée sur `develop` dans les skills workflow (`workflow-config`, `tech-stack`) ([`ed4eb21`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/ed4eb21))
- Migration `0004_professions_extended.sql` : colonnes `slug` (UNIQUE), `category` et `active` ajoutées à `professions` + index `professions_category_idx` ([#71](https://github.com/alex-robert-fr/entreprise-scrapper/pull/71))
- `package.json` : script `db:setup` (`npm run db:migrate && npm run db:seed`) pour initialiser la base en une commande ([#71](https://github.com/alex-robert-fr/entreprise-scrapper/pull/71))

[Unreleased]: https://github.com/alex-robert-fr/entreprise-scrapper/compare/v0.1.0...HEAD
