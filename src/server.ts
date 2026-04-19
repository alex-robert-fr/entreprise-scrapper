import "dotenv/config";
import path from "path";
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { requireAuth, dashboardGuard, alreadyAuthGuard } from "./middleware/auth";
import { validateBody, validateQuery, getValidatedQuery } from "./middleware/validate";
import { getStats, streamAll, getPaginated, getFilterOptions, getPhoneDuplicates, cleanPhoneDuplicates, getNameDuplicates, cleanNameDuplicates, getExcludedCount, ResultFilters } from "./db/scraped";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { fetchEtablissements, streamEtablissements, REGIONS_DEPARTEMENTS } from "./sirene";
import { runPipeline } from "./pipeline";
import {
  scrapeBodySchema,
  resultsQuerySchema,
  exportQuerySchema,
  type ScrapeBody,
  type ResultsQuery,
  type ExportQuery,
} from "./schemas";

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const app = express();
const PORT = Number(process.env.PORT) || 3000;

interface ScrapeState {
  status: "idle" | "running" | "done";
  progress: number;
  total: number;
  current: string;
  result?: { newCount: number; alreadyKnown: number; notFoundCount: number };
}

let scrapeState: ScrapeState = {
  status: "idle",
  progress: 0,
  total: 0,
  current: "",
};

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

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/me", requireAuth, asyncHandler(async (req, res) => {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  res.json(result);
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

app.post("/api/scrape", requireAuth, validateBody(scrapeBodySchema), (req, res) => {
  if (scrapeState.status === "running") {
    res.status(409).json({ error: "Scrape déjà en cours" });
    return;
  }

  const { region, departement, all, limit } = req.body as ScrapeBody;
  const userId = req.user!.id;

  scrapeState = { status: "running", progress: 0, total: 0, current: "" };

  (async () => {
    const options = all ? {} : { region, departement };

    let source: Iterable<import("./sirene").Etablissement> | AsyncIterable<import("./sirene").Etablissement>;
    if (limit !== undefined) {
      scrapeState.total = limit;
      source = streamEtablissements(options);
    } else {
      const etablissements = await fetchEtablissements(options);
      scrapeState.total = etablissements.length;
      source = etablissements;
    }

    const result = await runPipeline(source, userId, (current, nom) => {
      scrapeState.progress = current;
      scrapeState.current = nom;
    }, limit);

    scrapeState.status = "done";
    scrapeState.result = {
      newCount: result.newCount,
      alreadyKnown: result.alreadyKnown,
      notFoundCount: result.notFoundCount,
    };
  })().catch((err) => {
    scrapeState.status = "done";
    scrapeState.current = `Erreur : ${err instanceof Error ? err.message : String(err)}`;
  });

  res.json({ message: "Scrape lancé" });
});

app.get("/api/status", requireAuth, (_req, res) => {
  res.json(scrapeState);
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
    const row = [r.siret, r.nom, r.adresse, r.ville, r.codePostal, r.telephone, r.effectifTranche, r.formeJuridique, r.dirigeants, r.source, r.scraped_at]
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

app.listen(PORT, () => {
  console.log(`Dashboard disponible sur http://localhost:${PORT}`);
});
