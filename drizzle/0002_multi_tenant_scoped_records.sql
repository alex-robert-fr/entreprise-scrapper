-- Cloisonnement strict par user : PK composite (user_id, siret), FK + NOT NULL.
-- Les lignes legacy sans user_id (anterieures a Better Auth) sont invisibles en UI
-- depuis la PR #67. On refuse la migration si elles existent encore : c'est a
-- l'operateur de les rattacher a un user ou de les supprimer manuellement,
-- apres backup, pour eviter toute perte silencieuse.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "scraped_records" WHERE "user_id" IS NULL) THEN
    RAISE EXCEPTION 'scraped_records contient des lignes sans user_id. Faire un backup (pg_dump -t scraped_records), puis rattacher ou supprimer manuellement avant de rejouer cette migration.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "scraped_records" DROP CONSTRAINT "scraped_records_pkey";--> statement-breakpoint
ALTER TABLE "scraped_records" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scraped_records" ADD CONSTRAINT "scraped_records_user_id_siret_pk" PRIMARY KEY("user_id","siret");--> statement-breakpoint
ALTER TABLE "scraped_records" ADD CONSTRAINT "scraped_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
