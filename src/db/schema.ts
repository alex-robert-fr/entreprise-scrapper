import {
  pgTable,
  text,
  integer,
  timestamp,
  serial,
  boolean,
  index,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql, type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// ─── Tables gérées par Better Auth ──────────────────────────────────────────
// Ne pas renommer les colonnes — Better Auth les attend littéralement.

export const user = pgTable("user", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull(),
  email:         text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image:         text("image"),
  role:          text("role").notNull().default("user"),
  banned:        boolean("banned").notNull().default(false),
  banReason:     text("ban_reason"),
  banExpires:    timestamp("ban_expires", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id:             text("id").primaryKey(),
    userId:         text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    token:          text("token").notNull().unique(),
    expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress:      text("ip_address"),
    userAgent:      text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id:                    text("id").primaryKey(),
    userId:                text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accountId:             text("account_id").notNull(),
    providerId:            text("provider_id").notNull(),
    accessToken:           text("access_token"),
    refreshToken:          text("refresh_token"),
    idToken:               text("id_token"),
    accessTokenExpiresAt:  timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope:                 text("scope"),
    password:              text("password"),
    createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Scraped records — une fiche entreprise enrichie par SIRENE + Google Maps.
// PK composite (user_id, siret) : chaque user possede ses propres fiches,
// deux users peuvent scraper le meme SIRET sans collision.
// excluded reste globale pour l'instant (refonte multi-tenant complete prevue #66).
export const scrapedRecords = pgTable(
  "scraped_records",
  {
    siret:           text("siret").notNull(),
    userId:          text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
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
    primaryKey({ columns: [t.userId, t.siret] }),
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
export const credits = pgTable("credits", {
  userId:  text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
});

// Historique des mouvements de crédits — achats, consommations, refunds, grants admin.
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id:             serial("id").primaryKey(),
    userId:         text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
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
export type UserRow              = InferSelectModel<typeof user>;
export type NewUser              = InferInsertModel<typeof user>;
export type SessionRow           = InferSelectModel<typeof session>;
export type AccountRow           = InferSelectModel<typeof account>;
export type VerificationRow      = InferSelectModel<typeof verification>;
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
