import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { runMigrations } from "./db/migrate.js";
import { seedProfessions } from "./db/seeds/professions.js";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { requireAuth, dashboardGuard, alreadyAuthGuard, adminDashboardGuard, requireAdminAuth } from "./middleware/auth.js";
import { validateBody, validateQuery, getValidatedQuery } from "./middleware/validate.js";
import { getStats, streamAll, getPaginated, getFilterOptions, getPhoneDuplicates, cleanPhoneDuplicates, getNameDuplicates, cleanNameDuplicates, getExcludedCount, ResultFilters } from "./db/scraped.js";
import { getBalance, getRecentTransactions, adminGrant, InsufficientCreditsError } from "./db/credits.js";
import { listUsers, getUserDetail } from "./db/admin.js";
import { listActiveProfessions, getProfessionById } from "./db/professions.js";
import { sql } from "drizzle-orm";
import { db, closeDb } from "./db/client.js";
import { fetchEtablissements, streamEtablissements, REGIONS_DEPARTEMENTS } from "./sirene.js";
import { runPipeline } from "./pipeline.js";
import {
  scrapeBodySchema,
  resultsQuerySchema,
  exportQuerySchema,
  adminCreditBodySchema,
  adminUsersQuerySchema,
  type ScrapeBody,
  type ResultsQuery,
  type ExportQuery,
  type AdminCreditBody,
  type AdminUsersQuery,
} from "./schemas/index.js";

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const app = express();
const PORT = Number(process.env.PORT) || 3000;

interface ScrapeState {
  status: "idle" | "running" | "done" | "stopped_no_credits" | "error";
  progress: number;
  total: number;
  current: string;
  error?: string;
  result?: { newCount: number; alreadyKnown: number; notFoundCount: number; stoppedForCredits?: boolean };
  finishedAt?: number;
}

const IDLE_STATE: ScrapeState = { status: "idle", progress: 0, total: 0, current: "" };
const scrapeStates = new Map<string, ScrapeState>();

const CLEANUP_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function getScrapeState(userId: string): ScrapeState {
  return scrapeStates.get(userId) ?? { ...IDLE_STATE };
}

function cleanupFinishedStates(now: number = Date.now()) {
  for (const [userId, state] of scrapeStates) {
    if (
      state.status !== "running" &&
      (state.finishedAt === undefined || now - state.finishedAt > CLEANUP_TTL_MS)
    ) {
      scrapeStates.delete(userId);
    }
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Better Auth doit lire le body brut — monté AVANT express.json()
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.get("/", dashboardGuard);
app.get("/index.html", dashboardGuard);

app.get("/login", alreadyAuthGuard, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});
app.get("/signup", alreadyAuthGuard, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});

app.get("/admin", adminDashboardGuard, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/me", requireAuth, asyncHandler(async (req, res) => {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  res.json(result);
}));

app.get("/api/credits", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const [balance, recentTransactions] = await Promise.all([
    getBalance(userId),
    getRecentTransactions(userId),
  ]);
  res.json({
    balance,
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}));

app.get("/api/admin/users", requireAdminAuth, validateQuery(adminUsersQuerySchema), asyncHandler(async (_req, res) => {
  const query = getValidatedQuery<AdminUsersQuery>(res);
  const users = await listUsers(query);
  res.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      role: u.role,
      balance: u.balance,
      totalPurchases: u.totalPurchases,
      totalScraped: u.totalScraped,
    })),
  });
}));

app.get("/api/admin/users/:userId", requireAdminAuth, asyncHandler(async (req, res) => {
  const detail = await getUserDetail(req.params.userId);
  if (!detail) {
    res.status(404).json({ error: "User introuvable" });
    return;
  }
  res.json({
    id: detail.id,
    email: detail.email,
    createdAt: detail.createdAt.toISOString(),
    role: detail.role,
    balance: detail.balance,
    totalPurchases: detail.totalPurchases,
    totalScraped: detail.totalScraped,
    transactions: detail.transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      metadata: t.metadata,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}));

app.post("/api/admin/users/:userId/credits", requireAdminAuth, validateBody(adminCreditBodySchema), asyncHandler(async (req, res) => {
  const { amount, note } = req.body as AdminCreditBody;
  const targetUserId = req.params.userId;
  try {
    await adminGrant(targetUserId, amount, { adminId: req.user!.id, note });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(409).json({ error: "Débit impossible : solde insuffisant ou user sans crédits" });
      return;
    }
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23503") {
      res.status(404).json({ error: "User introuvable" });
      return;
    }
    throw err;
  }
  const balance = await getBalance(targetUserId);
  res.json({ balance });
}));

function pickFilters(query: ResultsQuery | ExportQuery): ResultFilters {
  return {
    sourceFilter:   query.source,
    sourceExact:    query.sourceExact,
    nom:            query.nom,
    ville:          query.ville,
    phoneType:      query.phoneType,
    effectif:       query.effectif,
    departement:    query.departement,
    formeJuridique: query.formeJuridique,
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[health] db unavailable", err);
    res.status(503).json({ status: "error" });
  }
});

app.get("/api/regions", requireAuth, (_req, res) => {
  res.json(Object.keys(REGIONS_DEPARTEMENTS));
});

app.get("/api/professions", requireAuth, asyncHandler(async (_req, res) => {
  const rows = await listActiveProfessions();
  res.json(rows.map(({ id, slug, libelle, category }) => ({ id, slug, libelle, category })));
}));

app.get("/api/stats", requireAuth, asyncHandler(async (req, res) => {
  res.json(await getStats(req.user!.id));
}));

app.get("/api/filters", requireAuth, asyncHandler(async (req, res) => {
  res.json(await getFilterOptions(req.user!.id));
}));

app.get("/api/results", requireAuth, validateQuery(resultsQuerySchema), asyncHandler(async (req, res) => {
  const query = getValidatedQuery<ResultsQuery>(res);
  res.json(await getPaginated(req.user!.id, query.page, query.limit, pickFilters(query)));
}));

app.post("/api/scrape", requireAuth, validateBody(scrapeBodySchema), asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  if (scrapeStates.get(userId)?.status === "running") {
    res.status(409).json({ error: "Scrape déjà en cours" });
    return;
  }

  // Pré-check UX uniquement — la vraie garantie d'atomicité est la contrainte
  // CHECK Postgres (balance >= 0) appliquée dans consumeOne via insertWithCreditConsume.
  const balance = await getBalance(userId);
  if (balance <= 0) {
    if (balance === 0) console.warn(`[billing] solde=0 pour userId=${userId} — row credits absente ou solde épuisé`);
    res.status(402).json({ error: "INSUFFICIENT_CREDITS", balance });
    return;
  }

  const { region, departement, all, limit, professionId } = req.body as ScrapeBody;

  let nafCodes: string[] | undefined;
  if (professionId !== undefined) {
    const profession = await getProfessionById(professionId);
    if (!profession) {
      res.status(400).json({ error: "Profession inconnue" });
      return;
    }
    if (!profession.nafCodes.length) {
      res.status(400).json({ error: "Cette profession n'a pas de codes NAF configurés" });
      return;
    }
    nafCodes = profession.nafCodes;
  }

  const state: ScrapeState = { status: "running", progress: 0, total: 0, current: "" };
  scrapeStates.set(userId, state);

  (async () => {
    const baseOptions = all ? {} : { region, departement };
    const options = { ...baseOptions, ...(nafCodes ? { nafCodes } : {}) };

    let source: Iterable<import("./sirene.js").Etablissement> | AsyncIterable<import("./sirene.js").Etablissement>;
    if (limit !== undefined) {
      state.total = limit;
      source = streamEtablissements(options);
    } else {
      const etablissements = await fetchEtablissements(options);
      state.total = etablissements.length;
      source = etablissements;
    }

    const result = await runPipeline(source, userId, (current, nom) => {
      state.progress = current;
      state.current = nom;
    }, limit);

    state.status = result.stoppedForCredits ? "stopped_no_credits" : "done";
    state.result = {
      newCount: result.newCount,
      alreadyKnown: result.alreadyKnown,
      notFoundCount: result.notFoundCount,
      stoppedForCredits: result.stoppedForCredits,
    };
    if (result.stoppedForCredits) {
      state.error = "Crédits insuffisants — scrape arrêté avant la fin";
    }
    state.finishedAt = Date.now();
  })().catch((err) => {
    state.status = "error";
    state.error = err instanceof Error ? err.message : String(err);
    state.finishedAt = Date.now();
  });

  res.json({ message: "Scrape lancé" });
}));

app.get("/api/status", requireAuth, (req, res) => {
  res.json(getScrapeState(req.user!.id));
});

app.get("/api/duplicates/phone", requireAuth, asyncHandler(async (req, res) => {
  res.json(await getPhoneDuplicates(req.user!.id));
}));

app.post("/api/duplicates/phone/clean", requireAuth, asyncHandler(async (req, res) => {
  const deleted = await cleanPhoneDuplicates(req.user!.id);
  res.json({ deleted });
}));

app.get("/api/duplicates/name", requireAuth, asyncHandler(async (req, res) => {
  res.json(await getNameDuplicates(req.user!.id));
}));

app.post("/api/duplicates/name/clean", requireAuth, asyncHandler(async (req, res) => {
  const deleted = await cleanNameDuplicates(req.user!.id);
  res.json({ deleted });
}));

app.get("/api/duplicates/excluded-count", requireAuth, asyncHandler(async (req, res) => {
  res.json({ count: await getExcludedCount(req.user!.id) });
}));


app.get("/api/export", requireAuth, validateQuery(exportQuerySchema), asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=export.csv");

  const escape = (v: string | null) => {
    if (!v) return "";
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  res.write("siret,nom,adresse,ville,code_postal,telephone,effectif_tranche,forme_juridique,dirigeants,source,scraped_at\n");

  for await (const r of streamAll(req.user!.id, pickFilters(getValidatedQuery<ExportQuery>(res)))) {
    const row = [r.siret, r.nom, r.adresse, r.ville, r.codePostal, r.telephone, r.effectifTranche, r.formeJuridique, r.dirigeants, r.source, r.scrapedAt]
      .map(escape)
      .join(",");
    res.write(row + "\n");
  }

  res.end();
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[API error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Erreur serveur" });
});

(async () => {
  try {
    await runMigrations();
    const { inserted, skipped } = await seedProfessions(db);
    console.log(`[seed] professions: ${inserted} insérées, ${skipped} déjà présentes`);
  } catch (err) {
    console.error("[boot] échec migrations/seed :", err);
    process.exit(1);
  }

  cleanupTimer = process.env.NODE_ENV === "test" ? null : setInterval(cleanupFinishedStates, CLEANUP_INTERVAL_MS);
  cleanupTimer?.unref();

  const server = app.listen(PORT, () => {
    console.log(`Dashboard disponible sur http://localhost:${PORT}`);
  });

  function shutdown() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    server.close(async () => {
      await closeDb().catch(() => {});
      process.exit(0);
    });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
