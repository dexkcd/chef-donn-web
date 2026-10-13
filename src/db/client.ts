import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "postgres://postgres@127.0.0.1:54329/chefdonn";

function connect(url: string) {
  return postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10), onnotice: () => {} });
}

// Reuse one pool across Next dev hot reloads.
const g = globalThis as unknown as { __chefdonnPg?: ReturnType<typeof connect> };
const client = g.__chefdonnPg ?? connect(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
if (process.env.NODE_ENV !== "production") g.__chefdonnPg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run a query: the pool or an open transaction. */
export type Executor = Db | Tx;

export async function closeDb() {
  await client.end({ timeout: 5 });
  if (g.__chefdonnPg === client) g.__chefdonnPg = undefined;
}
