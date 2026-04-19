-- Cloisonnement strict par user : PK composite (user_id, siret), FK + NOT NULL.
-- Les lignes legacy sans user_id (anterieures a Better Auth) sont invisibles en UI
-- depuis la PR #67 — on les purge ici pour pouvoir appliquer NOT NULL.
DELETE FROM "scraped_records" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "scraped_records" DROP CONSTRAINT "scraped_records_pkey";--> statement-breakpoint
ALTER TABLE "scraped_records" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scraped_records" ADD CONSTRAINT "scraped_records_user_id_siret_pk" PRIMARY KEY("user_id","siret");--> statement-breakpoint
ALTER TABLE "scraped_records" ADD CONSTRAINT "scraped_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
