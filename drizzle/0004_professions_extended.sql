ALTER TABLE "professions" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "professions" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "professions" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "professions_category_idx" ON "professions" USING btree ("category");--> statement-breakpoint
ALTER TABLE "professions" ADD CONSTRAINT "professions_slug_unique" UNIQUE("slug");