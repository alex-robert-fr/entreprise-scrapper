import "dotenv/config";
import path from "path";
import express from "express";
import { initDb, getStats, getAll, getPaginated } from "./dedup";
import { fetchEtablissements, REGIONS_DEPARTEMENTS } from "./sirene";
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

app.get("/api/regions", (_req, res) => {
  res.json(Object.keys(REGIONS_DEPARTEMENTS));
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/results", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(getPaginated(page, limit));
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
    const etablissements = await fetchEtablissements(options);
    scrapeState.total = limit ?? etablissements.length;

    const result = await runPipeline(etablissements, (current, total, nom) => {
      scrapeState.progress = current;
      scrapeState.total = total;
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

app.get("/api/export", (_req, res) => {
  const records = getAll();

  const header = "siret,nom,adresse,ville,code_postal,telephone,effectif_tranche,source,scraped_at";
  const rows = records.map((r) => {
    const escape = (v: string | null) => {
      if (!v) return "";
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    return [r.siret, r.nom, r.adresse, r.ville, r.codePostal, r.telephone, r.effectifTranche, r.source, r.scraped_at]
      .map(escape)
      .join(",");
  });

  const csv = [header, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=export.csv");
  res.send(csv);
});

initDb();

app.listen(PORT, () => {
  console.log(`Dashboard disponible sur http://localhost:${PORT}`);
});
