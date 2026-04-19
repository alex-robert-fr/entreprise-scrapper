# Deployment — Railway

Guide pas-à-pas pour déployer le scrapper sur Railway avec Postgres managé, domaine custom et HTTPS.

Depuis #36, le projet utilise **Postgres + Drizzle ORM**. L'ancienne DB SQLite (`data/scraper.db`) n'est plus utilisée et ne sera pas migrée (décision produit : on repart from scratch).

## Pré-requis

- Compte Railway (https://railway.app)
- Railway CLI : `npm i -g @railway/cli`
- Accès au repo GitHub `alex-robert-fr/entreprise-scrapper`
- Domaine acheté chez un registrar (ex : OVH, Gandi, Namecheap)

## 1. Créer le projet Railway

```bash
railway login
railway init
```

- Nom du projet : `entreprise-scrapper-prod`
- Accepter la création d'un nouveau projet vide

Ou via dashboard : https://railway.app/new → **Empty Project**.

## 2. Lier le repo GitHub

Dans le dashboard Railway :

1. Cliquer sur **New Service** → **GitHub Repo**
2. Sélectionner `alex-robert-fr/entreprise-scrapper`
3. Branche : `main`
4. **Auto-deploy** activé (push sur `main` déclenche un deploy)

## 3. Provisionner Postgres

Dans le dashboard Railway, projet `entreprise-scrapper-prod` :

1. Cliquer sur **New** → **Database** → **PostgreSQL**
2. Railway provisionne l'instance et crée la variable `DATABASE_URL` automatiquement dans le service
3. Lier la variable au service web : **Settings** → **Variables** → vérifier que `DATABASE_URL` pointe bien sur `${{Postgres.DATABASE_URL}}`

## 4. Configurer le domaine custom

### Dans Railway

1. Service web → **Settings** → **Networking** → **Custom Domain**
2. Entrer `leadscraper.<tld>` (TLD à confirmer avec le product owner)
3. Railway affiche un enregistrement CNAME (ex : `xxx.up.railway.app`)

### Chez le registrar

1. Créer un enregistrement **CNAME** :
   - **Nom/Host** : `leadscraper` (ou `@` pour l'apex, selon registrar)
   - **Valeur/Target** : URL fournie par Railway
   - **TTL** : 3600 (1h)
2. Attendre la propagation DNS (5 min à 30 min)

### HTTPS (Let's Encrypt)

Railway émet automatiquement le certificat Let's Encrypt une fois le DNS propagé. Vérifier dans **Settings** → **Networking** que le statut HTTPS est **Active**.

## 5. Renseigner les variables d'environnement

Dashboard Railway → service web → **Variables** → ajouter :

| Variable | Valeur | Notes |
|----------|--------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | (laisser Railway l'injecter) | Railway injecte `PORT` automatiquement |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | référence Railway |
| `SIRENE_TOKEN` | valeur réelle | |
| `GOOGLE_MAPS_API_KEY` | valeur réelle | |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | à générer |
| `BETTER_AUTH_URL` | `https://leadscraper.<tld>` | URL publique |
| `GOOGLE_OAUTH_CLIENT_ID` | (vide acceptable pour l'instant) | requis quand #37 merge |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (vide acceptable) | requis quand #37 merge |
| `POLAR_API_KEY` | (vide acceptable) | requis quand billing arrive |
| `POLAR_WEBHOOK_SECRET` | (vide acceptable) | idem |

## 6. Déclencher le premier deploy

```bash
git push origin main
```

Ou via dashboard Railway : **Deployments** → **Deploy**.

Vérifier :

- [ ] Build réussi (logs Railway → `npm run build` passe)
- [ ] Health check OK (`GET /api/health` → 200)
- [ ] Domaine résout et HTTPS actif
- [ ] App accessible sur `https://leadscraper.<tld>`

## Troubleshooting

### Build échoue

- Vérifier les logs Railway → onglet **Deployments** → cliquer sur le deploy échoué

### Health check KO

- Vérifier que `/api/health` répond localement : `curl http://localhost:3000/api/health`
- Ajuster `healthcheckTimeout` dans `railway.json` si le démarrage est long
- Le healthcheck interroge la DB via `getStats()` — si Postgres n'est pas joignable, le check renvoie 503

### Appliquer les migrations en prod

Railway ne joue pas automatiquement `drizzle-kit migrate`. Deux options :

- Ajouter `npm run db:migrate && npm run start:prod` dans la `startCommand` de `railway.json`
- Ou exécuter manuellement via `railway run npm run db:migrate` après chaque nouvelle migration

---

# Setup Postgres local

Le projet fournit un `docker-compose.yml` avec Postgres 16 pour le développement.

## Lancer la DB locale

```bash
docker compose up -d db
```

La DB écoute sur **localhost:5433** (port décalé pour éviter un conflit avec un éventuel Postgres système).

## Commandes Drizzle

| Commande | Usage |
|----------|-------|
| `npm run db:generate` | Générer un nouveau fichier SQL après modification de `src/db/schema.ts` |
| `npm run db:migrate` | Appliquer les migrations en attente (prod et dev) |
| `npm run db:push` | Pousser directement le schéma sans migration (dev only, rapide) |
| `npm run db:studio` | Ouvrir Drizzle Studio pour inspecter/éditer la DB |

## Workflow type

1. Modifier `src/db/schema.ts`
2. `npm run db:generate` → produit un nouveau `drizzle/000X_*.sql`
3. Relire le SQL généré avant commit
4. `npm run db:migrate` pour l'appliquer en local
5. Commit des fichiers `drizzle/` + `schema.ts`

## Références

- Railway docs : https://docs.railway.app
- Nixpacks : https://nixpacks.com
- Drizzle ORM : https://orm.drizzle.team
- Issues associées : #35 (Railway infra), #36 (migration Postgres)
