# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-18

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
