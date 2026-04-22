-- On ajoute slug/category en NOT NULL sans DEFAULT : Postgres refuse si la table
-- contient deja des lignes. Le seed (#44) repopule la table, donc on exige qu'elle
-- soit vide avant migration plutot que de laisser Postgres cracher une erreur opaque.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "professions") THEN
    RAISE EXCEPTION 'professions n''est pas vide. TRUNCATE "professions" RESTART IDENTITY; avant de rejouer (le seed #44 repopule la table).';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "professions" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "professions" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "professions" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "professions_category_idx" ON "professions" USING btree ("category");--> statement-breakpoint
ALTER TABLE "professions" ADD CONSTRAINT "professions_slug_unique" UNIQUE("slug");