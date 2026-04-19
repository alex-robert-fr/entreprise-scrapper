CREATE TABLE IF NOT EXISTS "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"polar_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_tx_type_check" CHECK ("credit_transactions"."type" IN ('purchase', 'consume', 'refund', 'admin_grant'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "excluded" (
	"siret" text PRIMARY KEY NOT NULL,
	"excluded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phone_cache" (
	"siret" text PRIMARY KEY NOT NULL,
	"telephone" text NOT NULL,
	"source" text NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "professions" (
	"id" serial PRIMARY KEY NOT NULL,
	"libelle" text NOT NULL,
	"naf_codes" text[] NOT NULL,
	CONSTRAINT "professions_libelle_unique" UNIQUE("libelle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scraped_records" (
	"siret" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"nom" text,
	"adresse" text,
	"ville" text,
	"code_postal" text,
	"telephone" text,
	"effectif_tranche" text,
	"forme_juridique" text,
	"dirigeants" text,
	"source" text NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_tx_user_created_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_cache_scraped_at_idx" ON "phone_cache" USING btree ("scraped_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scraped_records_user_id_idx" ON "scraped_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scraped_records_source_idx" ON "scraped_records" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scraped_records_code_postal_idx" ON "scraped_records" USING btree ("code_postal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scraped_records_telephone_idx" ON "scraped_records" USING btree ("telephone");