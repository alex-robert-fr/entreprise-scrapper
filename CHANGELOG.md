# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Ajout de la configuration Railway (`railway.json`) avec Nixpacks, healthcheck `/api/health` et restart automatique en cas d'échec ([`5af92b1`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/5af92b1))
- Variables d'environnement de production documentées dans `.env.example` par groupe : base de données, auth, OAuth Google, billing Polar (futures variables commentées avec référence au ticket) ([`e9caf2e`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e9caf2e))
- Script `start:prod` ajouté dans `package.json` pour démarrer le serveur compilé en production (`node dist/server.js`) ([`db5cff8`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/db5cff8))

### Fixed

- Health check `GET /api/health` retourne désormais `503` si la base de données est inaccessible, au lieu de `200` systématiquement ([`2221df0`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/2221df0))
- Script `build` rendu idempotent : la copie de `src/public/` vers `dist/public/` ne crée plus de sous-dossier parasite lors de builds consécutifs ([`e492309`](https://github.com/alex-robert-fr/entreprise-scrapper/commit/e492309))

[Unreleased]: https://github.com/alex-robert-fr/entreprise-scrapper/commits/main
