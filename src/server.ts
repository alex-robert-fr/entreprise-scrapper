import "dotenv/config";
import path from "path";
import express from "express";
import { getStats, getAll, getPaginated, getFilterOptions, getPhoneDuplicates, cleanPhoneDuplicates, getNameDuplicates, cleanNameDuplicates, getExcludedCount, ResultFilters } from "./db/scraped";
import { fetchEtablissements, streamEtablissements, REGIONS_DEPARTEMENTS } from "./sirene";
import { runPipeline } from "./pipeline";

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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function parseFilters(query: Record<string, unknown>): ResultFilters {
  const raw = (k: string) => (query[k] as string | undefined) || undefined;
  const rawSource    = raw("source");
  const rawPhoneType = raw("phoneType");
  const rawSourceEx  = raw("sourceExact");
  return {
    sourceFilter:
      rawSource === "found"      ? "found"      :
      rawSource === "non_trouvé" ? "non_trouvé" : undefined,
    sourceExact:
      rawSourceEx === "google"     ? "google"     :
      rawSourceEx === "non_trouvé" ? "non_trouvé" : undefined,
    nom:         raw("nom"),
    ville:       raw("ville"),
    phoneType:   rawPhoneType === "mobile" ? "mobile" : rawPhoneType === "fixe" ? "fixe" : undefined,
    effectif:       raw("effectif"),
    departement:    raw("departement"),
    formeJuridique: raw("formeJuridique"),
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    await getStats();
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error", reason: "db_unavailable" });
  }
});

app.get("/api/regions", (_req, res) => {
  res.json(Object.keys(REGIONS_DEPARTEMENTS));
});

app.get("/api/stats", async (_req, res) => {
  res.json(await getStats());
});

app.get("/api/filters", async (_req, res) => {
  res.json(await getFilterOptions());
});

app.get("/api/results", async (req, res) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 5000));
  res.json(await getPaginated(page, limit, parseFilters(req.query as Record<string, unknown>)));
});

app.post("/api/scrape", (req, res) => {
  if (scrapeState.status === "running") {
    res.status(409).json({ error: "Scrape déjà en cours" });
    return;
  }

  const { region, departement, all, limit: rawLimit } = req.body as {
    region?: string;
    departement?: string;
    all?: boolean;
    limit?: number;
  };
  const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, 10000))
    : undefined;

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

    const result = await runPipeline(source, (current, nom) => {
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

app.get("/api/status", (_req, res) => {
  res.json(scrapeState);
});

app.get("/api/duplicates/phone", async (_req, res) => {
  res.json(await getPhoneDuplicates());
});

app.post("/api/duplicates/phone/clean", async (_req, res) => {
  const deleted = await cleanPhoneDuplicates();
  res.json({ deleted });
});

app.get("/api/duplicates/name", async (_req, res) => {
  res.json(await getNameDuplicates());
});

app.post("/api/duplicates/name/clean", async (_req, res) => {
  const deleted = await cleanNameDuplicates();
  res.json({ deleted });
});

app.get("/api/duplicates/excluded-count", async (_req, res) => {
  res.json({ count: await getExcludedCount() });
});


app.get("/api/export", async (req, res) => {
  const records = await getAll(parseFilters(req.query as Record<string, unknown>));

  const header = "siret,nom,adresse,ville,code_postal,telephone,effectif_tranche,forme_juridique,dirigeants,source,scraped_at";
  const rows = records.map((r) => {
    const escape = (v: string | null) => {
      if (!v) return "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    return [r.siret, r.nom, r.adresse, r.ville, r.codePostal, r.telephone, r.effectifTranche, r.formeJuridique, r.dirigeants, r.source, r.scraped_at]
      .map(escape)
      .join(",");
  });

  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=export.csv");
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Dashboard disponible sur http://localhost:${PORT}`);
});
