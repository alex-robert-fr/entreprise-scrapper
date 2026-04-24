-- scraped_records : lien vers la profession utilisée lors du scrape.
-- Nullable car les fiches existantes n'ont pas de profession associée.
ALTER TABLE "scraped_records" ADD COLUMN "profession_id" integer REFERENCES "professions"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "scraped_records_profession_id_idx" ON "scraped_records" USING btree ("profession_id");--> statement-breakpoint

-- credits : empêcher un solde négatif au niveau DB (protection contre les race conditions).
ALTER TABLE "credits" ADD CONSTRAINT "credits_balance_non_negative" CHECK ("balance" >= 0);
