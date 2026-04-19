# Technical Changes

All notable technical changes targeted at contributors will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Refactor

- Port de `dedup.ts` (SQLite/better-sqlite3) vers `src/db/` avec Drizzle ORM + postgres-js : `scraped.ts`, `phoneCache.ts`, `client.ts`, `index.ts`, `schema.ts` ([`33639a0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/33639a0), [`e30efd0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e30efd0), [`8b7a160`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8b7a160), [`9b0b101`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/9b0b101))
- `getPhoneDuplicates`/`getNameDuplicates` : remplace les N+1 non bornés par une requête unique `inArray` + groupement en mémoire ([`e6909ab`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e6909ab))
- `server.ts` : wrapper `asyncHandler` + middleware d'erreur global sur toutes les routes async (évite le crash du process sur erreur DB non catchée) ([`e6909ab`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e6909ab))
- `phoneUtils.ts` : `phoneTypeCondition` renvoie un fragment `SQL` Drizzle typé au lieu d'une string brute ([`8b7a160`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8b7a160))
- `getFilterOptions` : migration de 4 requêtes raw vers `db.selectDistinct()` typé ([`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))

### Docs

- `DEPLOYMENT.md` : section setup Postgres local (docker compose) + commandes `db:generate`, `db:migrate`, `db:push`, `db:studio` + note migrations en prod ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e))
- `CLAUDE.md` : structure projet et système de déduplication mis à jour ; codes INSEE effectif corrigés (11, 12, 21, 22, 31, 32) ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e), [`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))
- `.claude/skills/tech-stack/SKILL.md` : stack DB mise à jour (Postgres + Drizzle) ([`d57246e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d57246e))

### Dependencies

- Retire `better-sqlite3` et `@types/better-sqlite3` ; ajoute `drizzle-orm` + `postgres` (runtime) et `drizzle-kit` (dev) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b))
- Ajout `better-auth@1.6.5` ; bump `drizzle-orm` 0.36 → 0.45 et `drizzle-kit` 0.28 → 0.31 pour compatibilité ([`8847f64`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8847f64))

### Chore

- `docker-compose.yml` : service Postgres 16-alpine sur le port 5433 (évite tout conflit avec un Postgres système) avec variables d'environnement surchargeables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b), [`733402e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/733402e))
- `drizzle.config.ts` : configuration drizzle-kit (schema path, dialect `postgresql`, strict + verbose) ([`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b))
- Migration initiale `drizzle/0000_init.sql` : 6 tables métier (`scraped_records`, `excluded`, `phone_cache`, `professions`, `credits`, `credit_transactions`) + 13 indexes ([`2bf5a30`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/2bf5a30))
- Tables auth Better Auth ajoutées au schéma Drizzle (`user`, `session`, `account`, `verification`) et migration `0001_auth_better_auth.sql` générée avec FK `credits.user_id` et `credit_transactions.user_id` → `user.id` (cascade delete) ([`57a686f`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/57a686f))
- Variable `BETTER_AUTH_TRUSTED_ORIGINS` (CSV) pour configurer plusieurs origines autorisées en plus de `BETTER_AUTH_URL` ([`0f20ef4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/0f20ef4))
- Hook `user.create.after` : gestion d'erreur avec relance et log d'avertissement si conflit sur insert crédits ([`0f20ef4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/0f20ef4))

[Unreleased]: https://github.com/alex-robert-fr/entreprise-scrapper/commits/main
