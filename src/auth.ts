import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "./db/client.js";
import { user, session, account, verification } from "./db/schema.js";
import { SIGNUP_CREDITS, grantSignupBonus } from "./db/credits.js";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET manquante — configurer .env");
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const extraOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const trustedOrigins = [baseURL, ...extraOrigins];
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  secret,
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : undefined,
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    cookiePrefix: "scraper",
    useSecureCookies: isProd,
  },
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          try {
            await db.transaction((tx) => grantSignupBonus(createdUser.id, SIGNUP_CREDITS, tx));
          } catch (err) {
            console.error("[auth] échec crédit initial", { userId: createdUser.id, err });
            // throw intentionnel : on préfère bloquer le signup plutôt que laisser
            // un user sans crédits. Si la DB credits est indisponible, Better Auth
            // annule la réponse et l'utilisateur peut retenter l'inscription.
            throw err;
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
