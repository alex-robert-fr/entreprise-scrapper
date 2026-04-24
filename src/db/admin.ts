import { desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "./client.js";
import {
  user,
  credits,
  creditTransactions,
  scrapedRecords,
  type CreditTransactionRow,
} from "./schema.js";

export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: Date;
  role: string;
  balance: number;
  totalPurchases: number;
  totalScraped: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  transactions: CreditTransactionRow[];
}

export interface ListUsersOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

const totalPurchasesSql = sql<number>`
  COALESCE((
    SELECT SUM(${creditTransactions.amount})
    FROM ${creditTransactions}
    WHERE ${creditTransactions.userId} = ${user.id}
      AND ${creditTransactions.type} = 'purchase'
  ), 0)
`.mapWith(Number);

const totalScrapedSql = sql<number>`
  COALESCE((
    SELECT COUNT(*)
    FROM ${scrapedRecords}
    WHERE ${scrapedRecords.userId} = ${user.id}
  ), 0)
`.mapWith(Number);

const balanceSql = sql<number>`COALESCE(${credits.balance}, 0)`.mapWith(Number);

export async function listUsers(opts: ListUsersOptions = {}): Promise<AdminUserSummary[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;

  const baseQuery = db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
      balance: balanceSql,
      totalPurchases: totalPurchasesSql,
      totalScraped: totalScrapedSql,
    })
    .from(user)
    .leftJoin(credits, eq(credits.userId, user.id));

  const filtered = opts.search
    ? baseQuery.where(ilike(user.email, `%${opts.search}%`))
    : baseQuery;

  return filtered.orderBy(desc(user.createdAt)).limit(limit).offset(offset);
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const [summary] = await db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
      balance: balanceSql,
      totalPurchases: totalPurchasesSql,
      totalScraped: totalScrapedSql,
    })
    .from(user)
    .leftJoin(credits, eq(credits.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!summary) return null;

  const transactions = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(50);

  return { ...summary, transactions };
}
