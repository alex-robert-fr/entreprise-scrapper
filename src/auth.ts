import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "./db/client";
import { user, session, account, verification, credits } from "./db/schema";

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

const SIGNUP_CREDITS = 50;

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
            const inserted = await db
              .insert(credits)
              .values({ userId: createdUser.id, balance: SIGNUP_CREDITS })
              .onConflictDoNothing()
              .returning({ userId: credits.userId });
            if (inserted.length === 0) {
              console.warn("[auth] crédit initial non appliqué (ligne existante)", {
                userId: createdUser.id,
              });
            }
          } catch (err) {
            console.error("[auth] échec crédit initial", { userId: createdUser.id, err });
            throw err;
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
