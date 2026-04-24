import { desc, eq, sql } from "drizzle-orm";
import { db, type Db } from "./client.js";
import { credits, creditTransactions, type CreditTransactionRow } from "./schema.js";

export const SIGNUP_CREDITS = 50;

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
  const inserted = await tx
    .insert(credits)
    .values({ userId, balance: amount })
    .onConflictDoNothing({ target: credits.userId })
    .returning({ userId: credits.userId });

  if (inserted.length === 0) {
    console.warn("[credits] signup bonus ignoré — ligne credits déjà présente", { userId });
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
      throw new InsufficientCreditsError(userId);
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

export async function adminGrant(userId: string, amount: number): Promise<void> {
  if (amount <= 0) {
    throw new Error("adminGrant: amount doit être > 0");
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(credits)
      .set({ balance: sql`${credits.balance} + ${amount}` })
      .where(eq(credits.userId, userId))
      .returning({ userId: credits.userId });

    if (updated.length === 0) {
      await tx.insert(credits).values({ userId, balance: amount });
    }

    await tx.insert(creditTransactions).values({
      userId,
      type: "admin_grant",
      amount,
    });
  });
}

