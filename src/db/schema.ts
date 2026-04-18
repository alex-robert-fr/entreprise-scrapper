import {
  pgTable,
  text,
  integer,
  timestamp,
  serial,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// Scraped records — une fiche entreprise enrichie par SIRENE + Google Maps.
// `userId` est nullable le temps que #37 (Better Auth) crée la table `users` ;
// #41 activera la FK et le NOT NULL.
export const scrapedRecords = pgTable(
  "scraped_records",
  {
    siret:           text("siret").primaryKey(),
    userId:          text("user_id"),
    nom:             text("nom"),
    adresse:         text("adresse"),
    ville:           text("ville"),
    codePostal:      text("code_postal"),
    telephone:       text("telephone"),
    effectifTranche: text("effectif_tranche"),
    formeJuridique:  text("forme_juridique"),
    dirigeants:      text("dirigeants"),
    source:          text("source").notNull(),
    scrapedAt:       timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scraped_records_user_id_idx").on(t.userId),
    index("scraped_records_source_idx").on(t.source),
    index("scraped_records_code_postal_idx").on(t.codePostal),
    index("scraped_records_telephone_idx").on(t.telephone),
  ],
);

// Excluded — SIRET archivés (doublons nettoyés) qu'on ne veut plus rescraper.
export const excluded = pgTable("excluded", {
  siret:      text("siret").primaryKey(),
  excludedAt: timestamp("excluded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Phone cache mutualisé entre users (TTL 3 mois), consommé par #43.
export const phoneCache = pgTable(
  "phone_cache",
  {
    siret:     text("siret").primaryKey(),
    telephone: text("telephone").notNull(),
    source:    text("source").notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("phone_cache_scraped_at_idx").on(t.scrapedAt)],
);

// Métiers supportés (boulanger, pâtissier, boucher...) — seedés en #44.
export const professions = pgTable("professions", {
  id:       serial("id").primaryKey(),
  libelle:  text("libelle").notNull().unique(),
  nafCodes: text("naf_codes").array().notNull(),
});

// Solde de crédits par user (1 fiche affichée = 1 crédit consommé en #47).
// FK vers users ajoutée par #37.
export const credits = pgTable("credits", {
  userId:  text("user_id").primaryKey(),
  balance: integer("balance").notNull().default(0),
});

// Historique des mouvements de crédits — achats, consommations, refunds, grants admin.
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id:             serial("id").primaryKey(),
    userId:         text("user_id").notNull(),
    type:           text("type").notNull(),
    amount:         integer("amount").notNull(),
    polarOrderId:   text("polar_order_id"),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
    check(
      "credit_tx_type_check",
      sql`${t.type} IN ('purchase', 'consume', 'refund', 'admin_grant')`,
    ),
  ],
);

// Types inférés — utiliser ces alias côté app plutôt que de redéfinir des interfaces.
export type ScrapedRecordRow     = InferSelectModel<typeof scrapedRecords>;
export type NewScrapedRecord     = InferInsertModel<typeof scrapedRecords>;
export type ExcludedRow          = InferSelectModel<typeof excluded>;
export type PhoneCacheRow        = InferSelectModel<typeof phoneCache>;
export type NewPhoneCache        = InferInsertModel<typeof phoneCache>;
export type ProfessionRow        = InferSelectModel<typeof professions>;
export type NewProfession        = InferInsertModel<typeof professions>;
export type CreditsRow           = InferSelectModel<typeof credits>;
export type CreditTransactionRow = InferSelectModel<typeof creditTransactions>;
export type NewCreditTransaction = InferInsertModel<typeof creditTransactions>;
