import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "./client.js";
import { credits, creditTransactions, type CreditTransactionRow } from "./schema.js";

export const SIGNUP_CREDITS = 50;

// Introspection interne — vérifier à chaque bump majeur de drizzle-orm
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export class InsufficientCreditsError extends Error {
  constructor(public readonly userId: string) {
    super(`Crédits insuffisants pour l'utilisateur ${userId}`);
    this.name = "InsufficientCreditsError";
  }
}

function isCheckViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23514"
  );
}

export async function getBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: credits.balance })
    .from(credits)
    .where(eq(credits.userId, userId))
    .limit(1);
  return row?.balance ?? 0;
}

export async function getRecentTransactions(
  userId: string,
  limit = 20,
): Promise<CreditTransactionRow[]> {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit);
}

export async function grantSignupBonus(
  userId: string,
  amount: number,
  tx: DbOrTx,
): Promise<void> {
  await tx
    .insert(credits)
    .values({ userId, balance: amount })
    .onConflictDoNothing({ target: credits.userId });

  // Vérifie si la transaction signup_bonus existe déjà (idempotence sur crash partiel)
  const existingTx = await tx
    .select({ id: creditTransactions.id })
    .from(creditTransactions)
    .where(and(eq(creditTransactions.userId, userId), eq(creditTransactions.type, "signup_bonus")))
    .limit(1);

  if (existingTx.length > 0) {
    console.warn("[credits] signup bonus déjà tracé", { userId });
    return;
  }

  await tx.insert(creditTransactions).values({
    userId,
    type: "signup_bonus",
    amount,
  });
}

export async function consumeOne(userId: string, tx: DbOrTx): Promise<void> {
  try {
    const updated = await tx
      .update(credits)
      .set({ balance: sql`${credits.balance} - 1` })
      .where(eq(credits.userId, userId))
      .returning({ userId: credits.userId });

    if (updated.length === 0) {
      throw new Error(`credits row manquante pour userId=${userId}`);
    }

    await tx.insert(creditTransactions).values({
      userId,
      type: "consume",
      amount: -1,
    });
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new InsufficientCreditsError(userId);
    }
    throw err;
  }
}

export interface AdminGrantOptions {
  adminId: string;
  note: string;
}

// Ajustement manuel admin : amount positif crédite, négatif débite.
// En cas de débit dépassant le solde, la check constraint DB renvoie InsufficientCreditsError.
export async function adminGrant(
  userId: string,
  amount: number,
  opts: AdminGrantOptions,
): Promise<void> {
  if (amount === 0) {
    throw new Error("adminGrant: amount ne peut pas être 0");
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(credits)
        .values({ userId, balance: amount })
        .onConflictDoUpdate({
          target: credits.userId,
          set: { balance: sql`${credits.balance} + ${amount}` },
        });

      await tx.insert(creditTransactions).values({
        userId,
        type: "admin_grant",
        amount,
        metadata: { admin_id: opts.adminId, note: opts.note },
      });
    });
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new InsufficientCreditsError(userId);
    }
    throw err;
  }
}

