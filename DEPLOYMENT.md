# Deployment — Railway

Guide pas-à-pas pour déployer le scrapper sur Railway avec Postgres managé, domaine custom et HTTPS.

> **Note importante :** à ce stade, le code utilise encore SQLite (`better-sqlite3`). Le Postgres Railway sera provisionné mais **non utilisé** tant que la migration (#36) n'est pas mergée. Le filesystem Railway étant éphémère, la DB SQLite ne persistera pas entre les redémarrages — c'est accepté dans le cadre du ticket #35.

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
- Souvent lié à une dépendance native (`better-sqlite3` nécessite `node-gyp`) : Nixpacks la gère par défaut

### Health check KO

- Vérifier que `/api/health` répond localement : `curl http://localhost:3000/api/health`
- Ajuster `healthcheckTimeout` dans `railway.json` si le démarrage est long

### Playwright en prod

Le fallback Pages Jaunes utilise Playwright qui nécessite un Chromium. Nixpacks ne l'installe pas par défaut. Options :

- **Option A** : accepter que le fallback PJ soit KO en prod (dégradé, acceptable)
- **Option B** : ajouter un `nixpacks.toml` avec `chromium` dans `apt-packages` et `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`

À trancher dans un ticket ultérieur.

## Références

- Railway docs : https://docs.railway.app
- Nixpacks : https://nixpacks.com
- Issue associée : #35
