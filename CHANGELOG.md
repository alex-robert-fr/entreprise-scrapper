# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `POST /api/scrape` retourne `402 Payment Required` si le solde est à 0 avant le lancement du scrape, avec body `{ error: "INSUFFICIENT_CREDITS", balance: 0 }` ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- Solde de crédits affiché dans le dashboard : badge dans la sidebar (orange ≤10 crédits, rouge à 0), actualisé en temps réel pendant le scrape ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- Popup "Crédits épuisés" avec CTA de recharge : affichée au clic si solde nul, sur réponse 402, ou quand le pipeline s'arrête en cours de route faute de crédits ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- `GET /api/status` retourne désormais `status: "error"` quand le pipeline rencontre une erreur inattendue ; le dashboard affiche un toast explicite au lieu d'un résumé vide ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))

- Les 50 crédits offerts à l'inscription sont désormais tracés dans l'historique et visibles via `GET /api/credits` (transaction `signup_bonus`) ([`12a7fbf`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/12a7fbf))
- Chaque fiche insérée lors d'un scrape consomme automatiquement 1 crédit ; le pipeline s'arrête si le solde atteint 0 et `GET /api/status` retourne un message explicite ([`f371473`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/f371473))
- `GET /api/credits` — retourne le solde actuel et les 20 dernières transactions (type, montant, date) ([`8c561d0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8c561d0))
- Authentification par email/password et Google OAuth disponible sur `/api/auth/*` : signup, signin, signout avec cookie de session `HttpOnly` (secure en production) ; 50 crédits offerts automatiquement à l'inscription ([`8613e41`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8613e41))
- `GET /api/me` — retourne la session courante de l'utilisateur connecté ; `401 Unauthorized` si non authentifié ([`8613e41`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8613e41))
- Pages `/login` et `/signup` disponibles : formulaire email/password + bouton Google OAuth, redirection vers `/` après authentification réussie ; un utilisateur déjà connecté accédant à ces pages est automatiquement redirigé vers `/` ([`9abac3e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/9abac3e))
- `GET /api/professions` — retourne la liste des 20 métiers actifs (`slug`, `libelle`, `category`) pré-seedés et catégorisés (Alimentation, BTP, Santé, Services, Automobile, Commerce, Beauté) ; disponibles immédiatement après `npm run db:setup` ([#71](https://github.com/alex-robert-fr/entreprise-scrapper/pull/71))
- Sélection de la profession cible dans le formulaire de scrape du dashboard : dropdown groupé par catégorie, chargé dynamiquement depuis `GET /api/professions` ; `POST /api/scrape` accepte un `professionId` optionnel pour restreindre la requête SIRENE aux codes NAF de la profession choisie — comportement boulanger/pâtissier conservé si absent ([`0746e04`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/0746e04))

### Changed

- **BREAKING** — La base de données passe de SQLite à Postgres. L'application nécessite désormais une `DATABASE_URL` ; en local, lancer `docker compose up -d db` puis `npm run db:migrate` avant de démarrer le serveur. L'ancienne base `data/scraper.db` n'est pas migrée (décision produit : on repart from scratch) ([`8b7a160`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8b7a160), [`9b0b101`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/9b0b101), [`fe0569b`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/fe0569b))
- **BREAKING** — Migration requise : `scraped_records` passe à une clé primaire composite `(user_id, siret)` avec contrainte FK `user_id → user.id` (cascade delete) ; lancer `npm run db:migrate` avant de démarrer cette version ([#68](https://github.com/alex-robert-fr/entreprise-scrapper/pull/68))

### Fixed

- La popup "Crédits épuisés" s'affiche correctement si le solde n'était pas encore chargé au moment du premier clic (race condition au chargement de la page) ([#86](https://github.com/alex-robert-fr/entreprise-scrapper/pull/86))
- L'insertion d'une fiche et le décrément du crédit s'effectuent dans la même transaction Postgres : un crash ne peut ni débiter sans insérer, ni insérer sans débiter ([`bc3deb9`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/bc3deb9))
- Les filtres par nom et ville du dashboard sont désormais insensibles à la casse (comportement SQLite restauré sous Postgres via `ILIKE`) ([`86aa1b4`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/86aa1b4))
- `GET /api/export` streame désormais le CSV ligne par ligne via un curseur Postgres : plus de timeout HTTP ni de saturation mémoire sur de grands volumes ([`e6909ab`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e6909ab))
- `POST /api/scrape` : retourne `400` avec message explicite si `professionId` est inconnu ou si la profession n'a pas de codes NAF configurés, au lieu d'un fallback silencieux sur les codes boulanger/pâtissier ([`66c39a2`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/66c39a2))
- Les erreurs 401 et 403 de l'API Google Maps lèvent désormais une exception explicite au lieu de retourner silencieusement `null`, rendant immédiatement visible tout problème de clé API invalide ou quota dépassé ([`d90a487`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/d90a487))

### Security

- Routes API protégées par authentification : toutes les routes `/api/*` (sauf `/api/auth/*` et `/api/health`) retournent `401 Unauthorized` si la session est absente ; le dashboard `/` redirige vers `/login` (302) si non authentifié ([`874cd46`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/874cd46))
- `GET /api/me` désormais protégé par le middleware d'authentification, cohérent avec le reste des routes ([`59f9104`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/59f9104))
- Les routes `POST /api/scrape`, `GET /api/results` et `GET /api/export` valident désormais tous les inputs : une valeur invalide (région inconnue, département mal formé, limite hors plage, filtre non reconnu) retourne `400` avec le champ fautif et un message explicite, au lieu d'un comportement imprévisible ([`6601e52`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/6601e52))
- Toutes les routes API retournent désormais uniquement les données de l'utilisateur authentifié : `/api/results`, `/api/export`, `/api/stats`, `/api/filters`, `/api/duplicates/*` et `GET /api/status` sont isolées par session — un utilisateur ne peut plus accéder aux fiches d'un autre ([`8c19bf6`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/8c19bf6), [`063fd61`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/063fd61))
- Les fiches scrapées sont désormais rattachées à l'utilisateur qui a lancé le scrape ; les fiches héritées sans `user_id` (antérieures à cette version) ne seront plus visibles tant que la colonne n'est pas rétroactivement peuplée (#41) ([`3442b43`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/3442b43))

## [0.1.0](https://github.com/alex-robert-fr/entreprise-scrapper/releases/tag/v0.1.0) - 2026-04-18

### Added

#### Scraping

- Pipeline de collecte SIRENE → Google Maps → Annuaire Entreprises pour les boulangeries-pâtisseries françaises (codes NAF `10.71C` et `10.71D`) filtrées sur 15+ salariés
- Trois portées de scraping : région, département, France entière
- Limite configurable de résultats par scrape (1 à 10 000)
- Retry exponentiel (3 tentatives) sur les appels API externes

#### Dashboard web (`http://localhost:3000`)

- Lancement d'un scrape depuis l'UI avec choix région/département/France et limite optionnelle
- Progression temps réel : pourcentage et nom de l'établissement en cours
- Résumé post-scrape : nouveaux, déjà connus, non trouvés
- Tableau paginé des résultats (établissement, ville, téléphone, source)
- Stats globales : total, avec téléphone, mobiles, non trouvés
- Filtres : nom, ville, département, effectif, forme juridique, type de téléphone
- Copie du téléphone au clic
- Détection et nettoyage des doublons par téléphone ou par nom, avec archivage (empêche le re-scrape)

#### API REST

- `GET /api/health` — statut applicatif (`200 OK` si DB accessible, `503 Service Unavailable` sinon)
- `GET /api/regions` — liste des régions SIRENE disponibles
- `GET /api/stats` — compteurs globaux
- `GET /api/filters` — valeurs disponibles pour chaque filtre (villes, effectifs, formes juridiques, etc.)
- `GET /api/results` — résultats paginés avec filtres
- `POST /api/scrape` — lancement asynchrone d'un scrape
- `GET /api/status` — état du scrape en cours
- `GET /api/duplicates/phone` + `POST /api/duplicates/phone/clean` — détection et nettoyage des doublons par téléphone
- `GET /api/duplicates/name` + `POST /api/duplicates/name/clean` — détection et nettoyage des doublons par nom
- `GET /api/duplicates/excluded-count` — nombre de SIRET archivés
- `GET /api/export` — export CSV avec filtres appliqués

#### Export CSV

- Colonnes : `siret, nom, adresse, ville, code_postal, telephone, effectif_tranche, forme_juridique, dirigeants, source, scraped_at`
- Filtrage par type de téléphone (mobile `06`/`07`, fixe, tout) et propagation des filtres avancés

#### Persistance

- Base SQLite locale (`data/scraper.db`) en mode WAL
- Déduplication par SIRET : un établissement déjà scrappé n'est jamais re-scrappé
- Archivage des SIRET nettoyés dans une table `excluded` pour empêcher leur re-collecte

#### Déploiement

- Configuration Railway (`railway.json`) avec Nixpacks, healthcheck `/api/health` et restart automatique (`ON_FAILURE`, 3 tentatives max)
- Script `start:prod` pour démarrer le serveur compilé en production (`node dist/server.js`)
- Build idempotent : copie de `src/public/` vers `dist/public/` sans sous-dossier parasite
- Variables d'environnement documentées par groupe dans `.env.example` (scraping + futures variables `DATABASE_URL`, Better Auth, OAuth Google, billing Polar commentées avec référence au ticket)
- Guide de déploiement Railway (`DEPLOYMENT.md`) : pré-requis, setup, provisioning Postgres, domaine custom, variables d'env, troubleshooting

[Unreleased]: https://github.com/alex-robert-fr/entreprise-scrapper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alex-robert-fr/entreprise-scrapper/releases/tag/v0.1.0
