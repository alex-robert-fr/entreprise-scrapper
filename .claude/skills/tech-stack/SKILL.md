---
name: tech-stack
description: Stack technique et conventions de code du projet. Utiliser lors de l'ecriture ou la revue de code pour respecter les standards et la stack du projet.
user-invocable: false
---

## Stack technique

### Backend / CLI
- **Runtime** : Node.js 18+ (fetch natif)
- **Langage** : TypeScript strict
- **HTTP** : fetch natif (pas d'axios/node-fetch)
- **Scraping** : Playwright (Pages Jaunes fallback)
- **Base de donnees** : Postgres via Drizzle ORM + postgres-js (local : docker compose sur port 5433)
- **CSV** : csv-writer
- **CLI** : minimist + ora (spinner)
- **Config** : dotenv

### Frontend (Dashboard)
- **Framework** : HTML/CSS/JS vanilla (pas de framework)
- **Serveur** : Express
- **Style** : Dark mode custom sans framework CSS

## Git

- **Branche par defaut** : main
- **Remote** : github.com/alex-robert-fr/entreprise-scrapper

## Architecture

- **Pattern** : Pipeline séquentiel (SIRENE → Google Maps → Pages Jaunes → Dédup → CSV)
- **Entrypoints** : `src/main.ts` (CLI), `src/server.ts` (dashboard)

## Conventions de nommage

| Contexte | Convention |
|----------|-----------|
| Fichiers | `camelCase.ts` |
| Variables / fonctions | `camelCase` |
| Types / Interfaces | `PascalCase` |
| Constantes | `UPPER_SNAKE_CASE` |

## Regles de qualite

- Pas de `any` TypeScript sans justification explicite
- Pas de commentaires évidents — le code doit se lire seul
- Pas de `console.log` de debug oublié (utiliser `ora` pour le feedback CLI)
- Pas d'import inutilisé
- Délai 1-2s entre les requêtes Pages Jaunes (politeness)
- Retry 3 tentatives max sur erreur réseau
